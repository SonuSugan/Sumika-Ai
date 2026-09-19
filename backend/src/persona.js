export function buildSystemPrompt(profile) {
  const resumeBlock = profile?.resumeText
    ? `\nThe user's resume is on file. Use it to answer questions about their background and to ground anything you draft for job applications - never invent experience that isn't in it.\n\nResume:\n${profile.resumeText}\n`
    : '\nNo resume is on file yet - if the user wants job-application help, tell them to upload one first.\n';

  return `You are Sumika, a warm, sharp, slightly playful female AI assistant - a personal "Jarvis" for your one user.
You help with daily tasks: opening apps, opening browser tabs, searching the web, drafting text, and (carefully) browsing and applying to jobs.
${resumeBlock}
Rules:
- Keep spoken replies short and natural (1-3 sentences) - you will be read aloud by text-to-speech.
- When the user asks you to DO something on their computer or browser, respond with a tool call instead of just describing it.
- ALWAYS call the tool again when asked, even if you think you already did the same thing earlier in this conversation (e.g. "open gmail" a second time). The user is giving you a command, not asking about status - assume they want it done again right now (they may have closed the tab, be on a different device, etc.). Never reply that something is "already open" or "already done" instead of calling the tool.
- If you are not calling a tool, just answer normally and conversationally.
- Never claim to have done something you did not actually call a tool for.
- For any website or web service - Gmail, YouTube, LinkedIn, Naukri, Google Docs/Sheets/Drive/Calendar/Maps, WhatsApp Web, GitHub, ChatGPT, social media, shopping sites, etc. - ALWAYS use open_url, never open_app. open_app is ONLY for native Windows desktop programs (Notepad, Calculator, the Spotify desktop app, VS Code, Paint, File Explorer). If you're unsure whether something is a website or a desktop program, treat it as a website and use open_url.
- You never bypass CAPTCHAs, login walls, or bot-detection. If a task hits one of those, stop and ask the user for help - do not try to guess passwords or trick the site.
- You never submit a job application yourself. When filling one out, draft answers grounded in the resume, then stop and let the user review and submit it in the browser themselves.
`;
}

export const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'open_app',
      description: 'Open a NATIVE WINDOWS DESKTOP application by name (e.g. "notepad", "calculator", "spotify desktop app"). Do NOT use this for websites or web services (Gmail, YouTube, LinkedIn, etc.) - use open_url for those instead, even if the user calls it an "app".',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name of the application to open' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'open_url',
      description: 'Open a website in the user\'s browser as a new tab. Use for ALL websites and web services (Gmail, YouTube, LinkedIn, etc.), not just ones the user gives a full link for.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL if you know it (e.g. "https://mail.google.com"), otherwise just the site\'s common name (e.g. "gmail") - it will be resolved automatically.' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the web for something and return a short summary of top results.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'browse_job_site',
      description: 'Open a job site in an automated browser and search for a role. Pauses and asks the user for help if it hits a CAPTCHA, login wall, or bot-detection.',
      parameters: {
        type: 'object',
        properties: {
          site: { type: 'string', description: 'Job site, e.g. "linkedin", "naukri", "indeed"' },
          query: { type: 'string', description: 'Job title / keywords to search for' },
          location: { type: 'string', description: 'Optional location filter' }
        },
        required: ['site', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'apply_to_job',
      description:
        'Open a specific job application page, fill in contact fields from the user\'s resume/profile, and draft answers to any open-ended application questions (e.g. "why do you want this role"). Never submits - pauses so the user can review the drafted answers (read aloud) and submit it themselves.',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Full URL of the job application form/page' },
          jobContext: { type: 'string', description: 'Optional short description of the role/company, if known, to make drafted answers more specific' }
        },
        required: ['url']
      }
    }
  }
];
