# Private-media incident response

Operational owner: ADLR Labs account holder. Security contact:
support@adlrlabs.com. This is an engineering procedure, not legal advice or a
certification of compliance. Review it with privacy counsel before launch.

## If unauthorized access or a leaked link is suspected

1. Escalate privately to the owner. Record discovery time, affected service,
   request IDs and scope. Do not copy body images, credentials or usable image
   links into chat, public issues, analytics, tickets or general logs.
2. Preserve minimal access/audit logs and object metadata under restricted access.
   Establish who accessed which service and when. A lack of alerts does not prove
   that no access occurred; do not announce conclusions before investigation.
3. Contain the affected path: pause vulnerable endpoints or uploads if necessary,
   remove unintended IAM/public grants and rotate exposed server credentials.
   For exposed Firebase download links, revoke the affected object download tokens.
   Token revocation may break old clients, but confirmed exposure takes priority;
   prepare a member notice and a tested authenticated-download release.
4. Assess account compromise separately. Revoke affected sessions, require account
   recovery and verify administrator MFA. Never ask members to send passwords or
   body photos to support. Restore from verified, access-controlled sources only.
5. Have counsel assess affected jurisdictions and the FTC Health Breach Notification
   Rule, state breach/consumer-health laws, contractual and store obligations.
   Track all applicable notification deadlines from discovery. Do not assume
   a disclaimer, consent checkbox, lack of nudity, or not being a doctor eliminates
   reporting obligations or liability. Notify affected members/regulators when
   required; do not conceal a suspected incident.
6. Fix the cause, add regression tests, independently verify isolation, and document
   recovery and member-remediation decisions. Reopen only the affected features
   once their security and basic workflows have been checked.

Official guidance:
https://www.ftc.gov/business-guidance/resources/complying-ftcs-health-breach-notification-rule-0
https://www.ftc.gov/business-guidance/resources/mobile-health-app-developers-ftc-best-practices

## Pre-launch controls requiring owner/provider evidence

- Verify MFA for Apple, Google/Firebase, GitHub, billing and support-mail admins;
  least-privilege IAM and emergency recovery contacts; do not record secrets here.
- Review cloud audit/access-log coverage, alerting, storage egress and spend limits.
- Validate private reads on a real iPhone before strict App Check enforcement or
  retiring legacy bearer links. Default dry-run metadata inventory must precede
  any bulk token revocation. Never print the tokens or full object paths.
- Test backup restoration and deletion/retention behavior (including soft-delete
  or object-versioning settings). Application deletion does not by itself prove
  every provider recovery copy is immediately purged.
- Obtain an independent penetration test and legal review of actual data flows,
  provider agreements, retention policy, privacy notices and breach response.
- Client code is inspectable. Never treat obfuscation, hidden buttons, a public
  Firebase project key or a private repository as an authorization boundary.
