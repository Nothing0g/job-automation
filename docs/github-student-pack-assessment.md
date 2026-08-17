# GitHub Student Developer Pack: deployment relevance

**Reviewed:** 17 August 2026

The official [GitHub Student Developer Pack](https://education.github.com/pack) currently lists several benefits relevant to a private application. The page states that eligible students can access 25+ Azure services with a **$100 Azure credit** (for students aged 18+), a selected free domain through **Name.com**, a free `.TECH` domain for one year, an **Appwrite Education plan** with two projects at equivalent Appwrite Pro resource limits while student-pack eligibility continues, and **Heroku credit of $13/month for 24 months**.[^pack]

| Benefit | What it can simplify | Important limitation for this project |
|---|---|---|
| Azure credit | One provider can host the application, database, and object storage. | The $100 credit is finite; an Azure implementation needs separate configuration and is less convenient than the already prepared Vercel adaptation. |
| Appwrite Education plan | A single service can provide user authentication, database, and file storage. | Migrating the existing Drizzle/MySQL data model and custom Google/Gmail OAuth into Appwrite would be a substantial rewrite. |
| Heroku credit | A conventional Node/Express host can run the current server with fewer serverless adaptations. | It is a monthly credit, and database/object storage still need separate services. |
| Name.com / `.TECH` domain | A stable public callback origin for Google OAuth. | A domain alone does not provide privacy, hosting, database, or Gmail integration. |

## Initial conclusion

The Student Pack is useful primarily for a **free domain** and potential **Azure credit**, but it does not remove Google OAuth or Gmail API setup. For the smallest change from the already-tested portable branch, retain the **Vercel deployment shape** and use the Student Pack domain as the stable OAuth callback domain. The app remains private through its Google-account allowlist.

If minimizing the number of services is more important than minimizing code change, a later dedicated Appwrite migration could consolidate authentication, database, and storage. It should be treated as a separate rewrite rather than folded into the current deployment.

### Important eligibility and privacy constraints

The Appwrite Education plan is available while the student remains eligible, but its official terms say it cannot be used for non-educational or commercial purposes.[^appwrite] Because this is a personal job-search automation tool rather than an educational project, Appwrite should **not** be selected unless the user independently confirms their intended use complies with those terms.

Azure for Students provides $100 for use within 12 months and can be renewed yearly while the user remains eligible. Its published terms also frame access around education, teaching, non-commercial research, and software development/testing/demonstration for those purposes.[^azure] It can be useful for learning or prototyping, but it is not the cleanest long-term foundation for this private personal tool without checking the applicable account terms.

Vercel's official documentation confirms that Hobby does not include Password Protection; its native password gate requires either Enterprise or Vercel Pro with the $150/month Advanced Deployment Protection add-on. The prepared Google-account allowlist remains the cost-appropriate privacy control for the portable project.[^vercel]

[^pack]: GitHub Education, “GitHub Student Developer Pack,” accessed 17 August 2026, https://education.github.com/pack.
[^appwrite]: Appwrite, “Education,” accessed 17 August 2026, https://appwrite.io/education.
[^azure]: Microsoft Azure, “Azure for Students,” accessed 17 August 2026, https://azure.microsoft.com/en-us/free/students.
[^vercel]: Vercel, “How do I add password protection to my Vercel deployment?,” updated 28 July 2026, https://vercel.com/kb/guide/how-do-i-add-password-protection-to-my-vercel-deployment.
