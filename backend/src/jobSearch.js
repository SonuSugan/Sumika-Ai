import fetch from 'node-fetch';
import { chat } from './llm/router.js';
import { getProfile } from './profile.js';
import { readCompanyList, getExistingJobLinks, appendJobRows } from './sheets.js';

const LOCATION_QUERY = '(Gurgaon OR Gurugram OR Noida OR Pune OR Bengaluru OR Bangalore OR France OR Netherlands)';

// Google Custom Search JSON API (free tier: 100 queries/day) scoped to a
// Programmable Search Engine restricted to LinkedIn/Indeed/Naukri/Glassdoor
// job pages - a real API, so no bot-detection/CAPTCHA risk like scraping a
// search engine's HTML page directly.
async function searchCompanyJobs(company) {
  const apiKey = process.env.GOOGLE_CUSTOM_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_CUSTOM_SEARCH_CX;
  if (!apiKey || !cx) throw new Error('GOOGLE_CUSTOM_SEARCH_API_KEY / GOOGLE_CUSTOM_SEARCH_CX not set');

  const query = `${company} jobs ${LOCATION_QUERY}`;
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&num=8&q=${encodeURIComponent(query)}`;

  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Custom Search error ${res.status}: ${text}`);
  }
  const data = await res.json();
  return (data.items || []).map((item) => ({
    title: item.title || '',
    link: item.link || '',
    snippet: item.snippet || ''
  }));
}

// Hands the raw search results + resume to the LLM and asks it to pick out
// genuine, relevant job postings - filtering noise like generic careers
// landing pages, search pages, or roles that don't match the resume.
async function extractRelevantJobs(company, results, resumeText) {
  if (!results.length) return [];

  const listing = results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.link}\n   ${r.snippet}`)
    .join('\n\n');

  const response = await chat({
    messages: [
      {
        role: 'system',
        content:
          'You screen job-board search results for genuine, specific job postings at one company that plausibly match a candidate\'s resume. ' +
          'Only include results that are an actual individual job posting (not a search results page, category listing, or unrelated article) at a location the candidate is targeting. ' +
          'Respond with ONLY a JSON array (no prose), each item: {"title": "...", "location": "...", "datePosted": "...", "link": "..."}. ' +
          'Use "" for fields you cannot determine. If nothing qualifies, respond with [].'
      },
      {
        role: 'user',
        content: `Candidate resume:\n${resumeText}\n\nSearch results for "${company}":\n${listing}\n\nReturn the JSON array.`
      }
    ],
    tools: []
  });

  try {
    const match = response.content.match(/\[[\s\S]*\]/);
    const parsed = JSON.parse(match ? match[0] : response.content);
    return Array.isArray(parsed) ? parsed.filter((j) => j.link) : [];
  } catch {
    return [];
  }
}

// The main scheduled routine: for every company in the sheet, search for
// matching roles, filter against the resume, dedupe against what's already
// recorded, and append new rows to the "Job Results" tab.
export async function runJobSearch({ onProgress } = {}) {
  const profile = await getProfile();
  if (!profile?.resumeText) {
    onProgress?.('No resume on file - skipping job search run.');
    return { ok: false, message: 'No resume on file.' };
  }

  const companies = await readCompanyList();
  const existingLinks = await getExistingJobLinks();

  let totalFound = 0;
  const errors = [];

  for (const company of companies) {
    try {
      const results = await searchCompanyJobs(company);
      const matches = await extractRelevantJobs(company, results, profile.resumeText);
      const newRows = matches
        .filter((m) => !existingLinks.has(m.link))
        .map((m) => ({ company, ...m }));

      if (newRows.length) {
        await appendJobRows(newRows);
        newRows.forEach((r) => existingLinks.add(r.link));
        totalFound += newRows.length;
        onProgress?.(`${company}: +${newRows.length} new`);
      } else {
        onProgress?.(`${company}: none new`);
      }
    } catch (err) {
      errors.push(`${company}: ${err.message}`);
      onProgress?.(`${company}: error - ${err.message}`);
    }
  }

  return {
    ok: true,
    message: `Job search complete: ${totalFound} new listing(s) added across ${companies.length} companies.`,
    totalFound,
    errors
  };
}
