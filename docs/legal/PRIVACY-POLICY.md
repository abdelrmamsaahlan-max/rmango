# RMango Privacy Policy

**Effective date: November 23, 2026**

RMango is an independent Windows desktop workspace for Roblox development. This policy explains what information RMango handles, why it is handled, and the choices available to users.

## 1. Who operates RMango and how to contact us

RMango is currently published as an independent developer project. The public project repository is https://github.com/abdelrmamsaahlan-max/rmango.

For a privacy or data request, open an issue at https://github.com/abdelrmamsaahlan-max/rmango/issues with the title **Private privacy request**. Do not include passwords, access tokens, identity documents, or other sensitive information in a public issue. Ask for a private contact method so the request can be handled privately.

The project should publish a dedicated privacy contact email and the responsible operator's legal identity before broad commercial release. This page does not replace that information where applicable law requires it.

## 2. Information RMango may process

Depending on the features you use, RMango may process:

- **Account and sign-in information:** account identifiers and basic profile details returned by the identity provider you choose, such as email address, display name, or profile picture. Supabase Auth handles the authentication flow. RMango does not need your Google or Roblox password.
- **Project information you choose to upload:** supported source/text files, project names, and related project metadata. Uploading a project to the cloud is an explicit user action. The current import workflow is limited to supported text formats; binary Roblox place/model files such as .rbxl and .rbxm are not parsed by the current version.
- **Prompts and workspace content:** chat messages, relevant project context, AI responses, proposals, and code or text you submit for processing.
- **Roblox Studio connector information:** when you connect the local Studio bridge, RMango may process available tool names and schemas, tool requests, results, and the content needed to carry out a task in your open Studio session. Some actions require your approval in the desktop app.
- **Service and usage information:** request and quota events, timestamps, error details, and operational/security logs needed to operate, protect, and troubleshoot the service. Cloud infrastructure providers may also process network and device information when requests reach their systems.

The exact information processed depends on what you type, upload, connect, and approve. Do not submit passwords, API keys, private access tokens, payment card details, or other secrets in prompts or project files.

## 3. How information is used

RMango uses information to:

- create and maintain your account and sign-in session;
- provide AI chat, project assistance, code proposals, and connected Roblox Studio features;
- store and retrieve projects, conversations, messages, and uploaded files you choose to keep in the cloud;
- enforce service quotas and usage limits;
- secure, monitor, troubleshoot, and improve the reliability of the service; and
- respond to support, privacy, and security requests.

## 4. AI processing

When you request AI assistance, your prompt and relevant context are sent from the desktop app to RMango's cloud API. The cloud API uses Cloudflare Workers AI for hosted model inference. The response is returned to the app.

Only send content you are entitled to share and that you are comfortable processing through the service. AI-generated code and advice may be incomplete or incorrect; review and test outputs before using them.

## 5. Service providers and sign-in providers

RMango relies on service providers to operate:

- **Supabase** provides authentication, database, and private file storage.
- **Cloudflare** hosts the cloud API and provides Workers AI inference, network delivery, and related infrastructure.
- **Google** may provide account identity information when you choose Google sign-in.
- **Roblox** may provide basic identity/profile information if and when Roblox sign-in is enabled and you choose it.

These providers process information under their own terms and privacy notices. RMango does not control their independent practices. RMango is not owned by, sponsored by, or affiliated with Roblox or Google.

## 6. Storage and security

The current cloud architecture stores account, project, conversation, message, usage, and uploaded-file data using Supabase services. The dedicated Supabase project is configured in the Frankfurt region. Cloudflare operates a global network, so network and service processing may occur in other locations as part of delivering the service.

The Windows app stores its RMango account session using Windows secure storage. RMango keeps server-side Supabase secrets in Cloudflare Worker runtime secrets, not in the desktop client.

Reasonable technical and organizational measures are used to protect information. No internet service or storage system can be guaranteed completely secure.

## 7. Retention and deletion

Cloud-stored information may be retained while it is needed to provide the service, maintain your account, enforce limits, resolve disputes, or meet legal and security requirements. Operational logs and provider backups may remain for a limited period under the relevant provider's retention practices.

The current public documentation does not describe a complete self-service account-deletion workflow. To request access, correction, export, or deletion, use the privacy contact route in Section 1 and ask for private handling. We may need to verify that you control the account before acting on a request.

Uninstalling the Windows app does not by itself delete cloud-stored account or project data. Sign out and submit a separate deletion request when you want cloud data removed.

## 8. Your choices

You can choose whether to connect an external sign-in provider, whether to upload a project, what to include in prompts, and whether to connect Roblox Studio. You can disconnect the local Studio bridge and stop using the app. Avoid uploading data you do not have permission to share.

Depending on where you live, you may have rights to access, correct, delete, restrict, or object to certain processing. Use the contact route in Section 1 to make a request.

## 9. Children and younger users

RMango is a development tool and is not designed for children under 13. We do not knowingly ask children under 13 to create accounts. If you believe a child under 13 has provided personal information to RMango, contact us using Section 1 and request private handling.

Users under the age of majority should use RMango only with any parent or guardian involvement required by the laws where they live.

## 10. Changes to this policy

This policy may be updated when RMango's features, providers, or legal requirements change. The effective date at the top will be updated when a new version is published. Continued use after an update means the updated notice applies to future use, subject to applicable law.

## 11. Third-party terms

Your use of Google, Roblox, Supabase, Cloudflare, and Roblox Studio is also subject to the applicable third-party terms and privacy notices. Review those notices before connecting those services.

---

**Important:** This policy describes the currently documented RMango architecture. It should be reviewed and completed with the responsible operator's legal identity and a dedicated privacy contact before commercial launch or formal legal reliance.
