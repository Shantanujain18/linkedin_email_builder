# LinkedIn Email Drafter

Local Next.js app for turning a resume and exported LinkedIn-post CSV into saved, reviewable outreach drafts.

The workflow is:

1. Upload a PDF, DOCX, or TXT resume. `gpt-4o-mini` extracts the candidate profile.
2. Upload the LinkedIn scraper CSV. The app stores posts in SQLite and extracts email addresses from every CSV field.
3. Generate personalized subject/body drafts for posts with detected email addresses.
4. Download the final CSV. The app does not send email.

## Run locally

```bash
cd /Users/apple/Desktop/Linkedin_Scrapper/email_sender
npm install
cp .env.example .env.local
```

Edit `.env.local` and set `OPENAI_API_KEY`. Then:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

SQLite is created automatically at `data/email_sender.sqlite` (or the path in `DATABASE_PATH`). Do not commit `.env.local`, `data/`, or `node_modules/`.

## CSV compatibility

The importer accepts the scraper columns `posted_by`, `posted_by_url`, `posted_date`, `posted_content`, and `post_url`, plus common aliases such as `author`, `content`, and `profile_url`.

## OpenAI safety

The API key is read only on the server from `OPENAI_API_KEY`; it is never sent to the browser. Generated messages are drafts for human review. Review recipient addresses and claims before using them.
