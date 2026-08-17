# Gemini API assessment for portable resume tailoring

## Verified findings

Google documents that a Gemini API key must remain server-side, should be read from an environment variable, and must never be embedded in browser code or committed to source control. The portable app can satisfy this by using a Vercel server-side environment secret named `GEMINI_API_KEY`.[1]

Gemini supports schema-constrained JSON responses, which is compatible with the current structured tailored-resume and email-draft workflow.[2]

Google’s Free Tier does **not** meet the project’s stated privacy-first objective for resume and job-description content. Google states that it may use unpaid-service prompts and responses to provide, improve, and develop products, and that human reviewers may process inputs and outputs. Google explicitly instructs users not to submit sensitive, confidential, or personal information to unpaid services.[3]

Google states that Paid Services do not use prompts or responses to improve products, although it logs them for a limited time for safety and abuse prevention. Moving from the Free Tier to paid access requires an active billing account and, under the current prepay setup, a minimum $10 credit purchase.[3] [4]

## Implication for Job Automation Studio

The project should not send the owner’s resume, contact information, job description, or personalized outreach text to Gemini’s Free Tier. A privacy-aligned Gemini integration requires a paid Gemini API project, server-side secret storage, and a strictly grounded prompt that uses only the stored master profile and job context. If the owner will not add billing, the safer options are to defer hosted AI generation or choose a provider whose free tier offers an acceptable data-use policy after separate verification.

## Sources

[1] Google AI for Developers, [Using Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key).

[2] Google AI for Developers, [Structured outputs](https://ai.google.dev/gemini-api/docs/structured-output).

[3] Google AI for Developers, [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms).

[4] Google AI for Developers, [Billing](https://ai.google.dev/gemini-api/docs/billing).
