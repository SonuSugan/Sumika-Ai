@echo off
REM Opens the deployed Sumika app (Vercel frontend -> Render backend).
REM Note: PC-control tools (open_app, browse_job_site, apply_to_job) only
REM work when Sumika's backend runs locally - the cloud backend can't reach
REM this PC's desktop. If you need those, run "npm run dev" from this folder
REM and open http://localhost:5173 instead.
start chrome "https://sumika-ai-theta.vercel.app"
