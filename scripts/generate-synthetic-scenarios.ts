#!/usr/bin/env -S tsx
/**
 * Generate synthetic Make scenarios for pattern-clustering prototyping.
 *
 * Rows are marked `is_synthetic = true` and excluded from /chat + /api/search
 * by default. The /browse UI hides them too unless `?include_demo=1` is set.
 *
 * Strategy: ~25 archetypes (common Make use cases) × N app combinations each.
 * Each row gets a REAL OpenAI embedding so vector retrieval works the same
 * way it would on production data — and patterns cluster naturally.
 *
 * Usage:
 *   pnpm tsx scripts/generate-synthetic-scenarios.ts                 # 500 default
 *   pnpm tsx scripts/generate-synthetic-scenarios.ts --count=100     # smaller batch
 *   pnpm tsx scripts/generate-synthetic-scenarios.ts --purge         # delete all synthetic
 *   pnpm tsx scripts/generate-synthetic-scenarios.ts --dry-run       # no DB writes
 *
 * Cost: ~$0.005 for 500 embeddings (text-embedding-3-small at ~600 tokens/row).
 * No Sonnet/Haiku calls — text is templated.
 */
import './_load-env'
import { createServiceClient } from '@/lib/supabase/service'
import { embedBatch } from '@/lib/llm/openai-embeddings'
import type { TablesInsert } from '@/lib/supabase/types'

type Insert = TablesInsert<'make_scenarios'>

interface AppRef {
  key: string // module key prefix (e.g. 'hubspotcrm')
  display: string // human-readable (e.g. 'HubSpot CRM')
}

interface AppCombo {
  trigger: AppRef
  action: AppRef
  extras: AppRef[]
}

interface Archetype {
  family: 'sales' | 'support' | 'marketing' | 'finance' | 'data-sync' | 'ops' | 'ecommerce' | 'ai' | 'devops' | 'hr'
  templateId: string
  category: string
  complexity: 'simple' | 'medium' | 'complex'
  triggerType: 'webhook' | 'polling' | 'scheduled' | 'instant'
  triggerApps: AppRef[]
  actionApps: AppRef[]
  extraApps?: AppRef[]
  tags: string[]
  useCases: string[]
  /** Build the row's text fields from a chosen app combo. */
  build: (c: AppCombo) => {
    scenario_name: string
    one_line_summary: string
    business_purpose: string
    full_description: string
    data_flow: string
    trigger_event: string
    error_handling: string
    reuse_notes: string
    branches: Array<{ condition: string; path_true: string; path_false: string }>
  }
}

// ──────────────────────────────────────────────────────────
// App catalogs (reused across archetypes)
// ──────────────────────────────────────────────────────────

const CRMS: AppRef[] = [
  { key: 'hubspotcrm', display: 'HubSpot CRM' },
  { key: 'salesforce', display: 'Salesforce' },
  { key: 'pipedrive', display: 'Pipedrive' },
  { key: 'zoho-crm', display: 'Zoho CRM' },
  { key: 'closeio', display: 'Close' },
  { key: 'freshsales', display: 'Freshsales' },
  { key: 'copper', display: 'Copper' },
  { key: 'monday-crm', display: 'monday.com CRM' },
]

const NOTIFY_CHANNELS: AppRef[] = [
  { key: 'slack', display: 'Slack' },
  { key: 'msteams', display: 'Microsoft Teams' },
  { key: 'discord', display: 'Discord' },
  { key: 'telegram', display: 'Telegram' },
  { key: 'gmail', display: 'Gmail' },
  { key: 'twilio', display: 'Twilio SMS' },
]

const TICKET_SYSTEMS: AppRef[] = [
  { key: 'zendesk', display: 'Zendesk' },
  { key: 'intercom', display: 'Intercom' },
  { key: 'freshdesk', display: 'Freshdesk' },
  { key: 'helpscout', display: 'Help Scout' },
  { key: 'jira-service-management', display: 'Jira Service Management' },
  { key: 'linear', display: 'Linear' },
]

const FORMS: AppRef[] = [
  { key: 'typeform', display: 'Typeform' },
  { key: 'tally', display: 'Tally' },
  { key: 'google-forms', display: 'Google Forms' },
  { key: 'jotform', display: 'Jotform' },
  { key: 'paperform', display: 'Paperform' },
  { key: 'webflow', display: 'Webflow Forms' },
]

const MARKETING_PLATFORMS: AppRef[] = [
  { key: 'mailchimp', display: 'Mailchimp' },
  { key: 'hubspot-marketing', display: 'HubSpot Marketing' },
  { key: 'customer-io', display: 'Customer.io' },
  { key: 'iterable', display: 'Iterable' },
  { key: 'klaviyo', display: 'Klaviyo' },
  { key: 'brevo', display: 'Brevo' },
  { key: 'activecampaign', display: 'ActiveCampaign' },
]

const ECOMMERCE: AppRef[] = [
  { key: 'shopify', display: 'Shopify' },
  { key: 'woocommerce', display: 'WooCommerce' },
  { key: 'bigcommerce', display: 'BigCommerce' },
  { key: 'magento', display: 'Magento' },
  { key: 'etsy', display: 'Etsy' },
  { key: 'amazon-seller', display: 'Amazon Seller' },
]

const PAYMENTS: AppRef[] = [
  { key: 'stripe', display: 'Stripe' },
  { key: 'chargebee', display: 'Chargebee' },
  { key: 'quickbooks', display: 'QuickBooks' },
  { key: 'xero', display: 'Xero' },
  { key: 'paddle', display: 'Paddle' },
  { key: 'freshbooks', display: 'FreshBooks' },
]

const DATA_STORES: AppRef[] = [
  { key: 'airtable', display: 'Airtable' },
  { key: 'google-sheets', display: 'Google Sheets' },
  { key: 'notion', display: 'Notion' },
  { key: 'mysql', display: 'MySQL' },
  { key: 'postgresql', display: 'PostgreSQL' },
  { key: 'mongodb', display: 'MongoDB' },
  { key: 'bigquery', display: 'BigQuery' },
  { key: 'snowflake', display: 'Snowflake' },
]

const FILE_STORAGE: AppRef[] = [
  { key: 'google-drive', display: 'Google Drive' },
  { key: 'dropbox', display: 'Dropbox' },
  { key: 'onedrive', display: 'OneDrive' },
  { key: 'box', display: 'Box' },
  { key: 'sharepoint', display: 'SharePoint' },
  { key: 'aws-s3', display: 'AWS S3' },
]

const CALENDARS: AppRef[] = [
  { key: 'google-calendar', display: 'Google Calendar' },
  { key: 'microsoft-calendar', display: 'Microsoft 365 Calendar' },
  { key: 'calendly', display: 'Calendly' },
  { key: 'cal-com', display: 'Cal.com' },
]

const AI_TOOLS: AppRef[] = [
  { key: 'openai', display: 'OpenAI' },
  { key: 'anthropic', display: 'Anthropic Claude' },
  { key: 'google-ai', display: 'Google AI' },
  { key: 'perplexity', display: 'Perplexity' },
]

const SOCIAL: AppRef[] = [
  { key: 'twitter', display: 'X / Twitter' },
  { key: 'linkedin', display: 'LinkedIn' },
  { key: 'facebook-pages', display: 'Facebook Pages' },
  { key: 'instagram-for-business', display: 'Instagram for Business' },
  { key: 'tiktok-for-business', display: 'TikTok for Business' },
]

const HR_SYSTEMS: AppRef[] = [
  { key: 'bamboohr', display: 'BambooHR' },
  { key: 'workday', display: 'Workday' },
  { key: 'gusto', display: 'Gusto' },
  { key: 'deel', display: 'Deel' },
  { key: 'rippling', display: 'Rippling' },
]

const DEVOPS: AppRef[] = [
  { key: 'github', display: 'GitHub' },
  { key: 'gitlab', display: 'GitLab' },
  { key: 'bitbucket', display: 'Bitbucket' },
  { key: 'sentry', display: 'Sentry' },
  { key: 'pagerduty', display: 'PagerDuty' },
  { key: 'datadog', display: 'Datadog' },
]

// ──────────────────────────────────────────────────────────
// Archetypes — 25 patterns that cover common Make use cases
// ──────────────────────────────────────────────────────────

const ARCHETYPES: Archetype[] = [
  // ─── Sales / CRM cluster (5) ───
  {
    family: 'sales',
    templateId: 'new-deal-won-alert',
    category: 'sales',
    complexity: 'simple',
    triggerType: 'instant',
    triggerApps: CRMS,
    actionApps: NOTIFY_CHANNELS,
    tags: ['sales', 'crm', 'notification', 'deal-tracking'],
    useCases: ['celebrate wins in real time', 'keep team in the loop'],
    build: (c) => ({
      scenario_name: `New deal won in ${c.trigger.display} → ${c.action.display} alert`,
      one_line_summary: `Notify the sales team in ${c.action.display} the moment a deal hits "Won" stage in ${c.trigger.display}`,
      business_purpose: `Real-time celebration + visibility on closed deals. When a ${c.trigger.display} deal moves to Won, the scenario formats a message with deal amount, owner, and account name and posts it to the configured ${c.action.display} channel. Eliminates manual #wins-channel updates.`,
      full_description: `Instant trigger on the ${c.trigger.display} "Deal stage changed" event filters for stage = Won. Fetches deal owner, amount, and associated account. Builds a Block Kit / rich text message (emoji + amount + rep name + product). Posts to a ${c.action.display} channel via webhook or native integration. Optionally also pings the deal owner directly.`,
      data_flow: `${c.trigger.display} deal-won webhook → Filter (stage = Won) → Fetch deal details + owner → Format celebration message → ${c.action.display} channel post`,
      trigger_event: `${c.trigger.display}: deal stage changed to Won`,
      error_handling: `If ${c.action.display} post fails, log to error channel and continue. Deal data is already in CRM — no rollback needed.`,
      reuse_notes: `Swap ${c.trigger.display} for any CRM that exposes a deal-stage webhook. Swap ${c.action.display} for any notification channel. Tweak the filter to celebrate only deals above a threshold.`,
      branches: [
        { condition: 'deal amount >= $10k', path_true: 'post to #big-wins channel', path_false: 'post to #wins channel' },
      ],
    }),
  },
  {
    family: 'sales',
    templateId: 'lead-form-to-crm',
    category: 'sales',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: FORMS,
    actionApps: CRMS,
    extraApps: NOTIFY_CHANNELS,
    tags: ['lead-capture', 'crm', 'forms', 'inbound'],
    useCases: ['capture website leads', 'auto-assign reps', 'avoid lost leads'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} submission → ${c.action.display} contact`,
      one_line_summary: `Capture form leads from ${c.trigger.display} and create or update a contact in ${c.action.display} with round-robin assignment`,
      business_purpose: `Closes the loop between website forms and CRM. Every ${c.trigger.display} submission becomes a ${c.action.display} contact within seconds — no manual paste from spreadsheets, no leads sitting in Typeform admin overnight. Round-robin assignment ensures fair lead distribution across reps.`,
      full_description: `Webhook from ${c.trigger.display} fires on submission. Scenario parses name, email, company, source UTM. Searches ${c.action.display} by email to dedupe. If contact exists, updates company + source + last-touched-at. If not, creates a new contact and assigns the next sales rep via a round-robin counter stored in a Data Store. Optionally posts to the configured ${c.extras[0]?.display ?? 'Slack'} channel for instant follow-up.`,
      data_flow: `${c.trigger.display} webhook → Parse fields → ${c.action.display} search by email → Router (exists / new) → Update or Create contact → Round-robin assign owner → ${c.extras[0]?.display ?? 'Slack'} notify`,
      trigger_event: `${c.trigger.display}: form submission`,
      error_handling: `${c.action.display} rate-limit retry with exponential backoff. Validation failures (invalid email) are logged to a "junk" Data Store row.`,
      reuse_notes: `Add a Clearbit enrichment step between parse and create for company-size + industry data. Swap round-robin for a territory-based router (assign by country).`,
      branches: [
        { condition: 'contact already exists in CRM', path_true: 'update record', path_false: 'create new + assign owner' },
      ],
    }),
  },
  {
    family: 'sales',
    templateId: 'meeting-booked-to-crm',
    category: 'sales',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: CALENDARS,
    actionApps: CRMS,
    tags: ['scheduling', 'crm', 'calendar', 'meeting-prep'],
    useCases: ['auto-log calls', 'meeting prep automation'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} booking → ${c.action.display} activity`,
      one_line_summary: `Log every meeting booked via ${c.trigger.display} as a CRM activity in ${c.action.display}, with attendee enrichment`,
      business_purpose: `Reps never have to log calls again. Every ${c.trigger.display} booking auto-creates a ${c.action.display} activity tied to the matching contact, with the meeting agenda, attendees, and a link to the prep doc. Pipeline reports get accurate touchpoint data without rep effort.`,
      full_description: `${c.trigger.display} sends a "booking created" webhook. The scenario extracts attendee emails, matches them to ${c.action.display} contacts (creating new ones if needed), and creates a "Meeting" activity with the meeting topic, time, and a generated agenda link. If the attendee is unknown, the scenario flags it for sales-ops review.`,
      data_flow: `${c.trigger.display} webhook → Extract attendees → ${c.action.display} contact lookup → Create activity → Link to deal (if matched)`,
      trigger_event: `${c.trigger.display}: meeting booked`,
      error_handling: `Unknown attendee → flag for review. CRM API failure → retry up to 3x then alert ops.`,
      reuse_notes: `Add an AI step to generate a one-page prep doc from the contact's CRM history + recent emails. Save as Google Doc, link in the activity.`,
      branches: [
        { condition: 'attendee email matches CRM contact', path_true: 'log activity to existing contact', path_false: 'create contact then log' },
      ],
    }),
  },
  {
    family: 'sales',
    templateId: 'deal-stage-sync',
    category: 'sales',
    complexity: 'complex',
    triggerType: 'instant',
    triggerApps: CRMS,
    actionApps: DATA_STORES,
    extraApps: NOTIFY_CHANNELS,
    tags: ['sales', 'crm', 'reporting', 'data-sync'],
    useCases: ['live pipeline dashboards', 'forecasting accuracy'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} pipeline → ${c.action.display} reporting`,
      one_line_summary: `Mirror every ${c.trigger.display} deal-stage change into ${c.action.display} for downstream BI dashboards`,
      business_purpose: `Ops + leadership get a live pipeline view in ${c.action.display} without waiting for nightly ETL. Useful for Looker / Tableau dashboards that need sub-minute freshness, and for finance forecasts that consume deal data from ${c.action.display} rather than direct CRM API access.`,
      full_description: `Instant trigger on any ${c.trigger.display} deal field change. Filters to relevant fields (stage, amount, close date, owner). Upserts a row in ${c.action.display} with a deal_id key. Maintains a separate "stage_history" table that appends one row per transition for time-in-stage analysis.`,
      data_flow: `${c.trigger.display} field-change webhook → Filter (tracked fields only) → ${c.action.display} upsert (deals) + append (stage_history)`,
      trigger_event: `${c.trigger.display}: deal field changed`,
      error_handling: `Idempotent upsert — re-deliveries from CRM webhook are safe. If ${c.action.display} write fails, retry 5x with exponential backoff; on final failure post to ${c.extras[0]?.display ?? 'Slack'} #data-ops.`,
      reuse_notes: `For high-volume pipelines, batch writes by 100 to avoid hammering ${c.action.display}. Consider also writing to a queue (SQS) for replay.`,
      branches: [
        { condition: 'tracked field changed', path_true: 'sync row + log history', path_false: 'ignore' },
      ],
    }),
  },
  {
    family: 'sales',
    templateId: 'crm-marketing-sync',
    category: 'sales',
    complexity: 'medium',
    triggerType: 'polling',
    triggerApps: CRMS,
    actionApps: MARKETING_PLATFORMS,
    tags: ['crm', 'marketing', 'sync', 'lifecycle'],
    useCases: ['bidirectional contact sync', 'audience segmentation'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} → ${c.action.display} contact sync`,
      one_line_summary: `Sync new and updated ${c.trigger.display} contacts to ${c.action.display} lists every 15 minutes`,
      business_purpose: `Marketing campaigns target the right people without contact lists going stale. New CRM contacts land in the correct ${c.action.display} list segmented by lifecycle stage; opt-outs in marketing flow back as do-not-contact flags in CRM.`,
      full_description: `Polls ${c.trigger.display} every 15 min for contacts updated since last run. Maps lifecycle stage to ${c.action.display} list. Creates / updates the marketing record. Tracks last-sync-cursor in a Data Store. Bidirectional: also polls ${c.action.display} for opt-outs and applies them back to the CRM contact.`,
      data_flow: `Schedule (15m) → ${c.trigger.display} updated-since query → Map lifecycle → ${c.action.display} list create/update → Reverse: ${c.action.display} opt-outs → ${c.trigger.display} update`,
      trigger_event: `Scheduled every 15 minutes`,
      error_handling: `Per-record errors collected and posted to a "sync errors" Slack channel at the end of each run. Cursor only advances on full success.`,
      reuse_notes: `Add an Audience Tag mapping table so marketing can manage segment names without code changes. Hash email before logging in error channel for compliance.`,
      branches: [
        { condition: 'lifecycle stage = Customer', path_true: 'add to onboarding list', path_false: 'add to nurture list' },
      ],
    }),
  },

  // ─── Support / Helpdesk cluster (4) ───
  {
    family: 'support',
    templateId: 'new-ticket-alert',
    category: 'support',
    complexity: 'simple',
    triggerType: 'webhook',
    triggerApps: TICKET_SYSTEMS,
    actionApps: NOTIFY_CHANNELS,
    tags: ['support', 'ticketing', 'notification'],
    useCases: ['fast first response', 'visibility for support team'],
    build: (c) => ({
      scenario_name: `New ${c.trigger.display} ticket → ${c.action.display}`,
      one_line_summary: `Alert the support team in ${c.action.display} on every new ${c.trigger.display} ticket with priority + customer tier`,
      business_purpose: `Every new ${c.trigger.display} ticket lands in the team's ${c.action.display} channel within seconds, with a one-click "Take it" button. Cuts first-response time from minutes to seconds during business hours.`,
      full_description: `${c.trigger.display} webhook on ticket creation fires the scenario. The scenario fetches customer tier from a Data Store, formats a ${c.action.display} message with priority color, subject, customer name, and tier. Includes a "View ticket" deep link.`,
      data_flow: `${c.trigger.display} ticket-created webhook → Fetch customer tier → Format message → ${c.action.display} post`,
      trigger_event: `${c.trigger.display}: ticket created`,
      error_handling: `If notify fails, retry once then drop — ticket still exists in source system.`,
      reuse_notes: `Add a router to send VIP-tier tickets to a different channel + page on-call. Add SLA timer that re-pings after N minutes if unassigned.`,
      branches: [],
    }),
  },
  {
    family: 'support',
    templateId: 'ticket-routing',
    category: 'support',
    complexity: 'complex',
    triggerType: 'webhook',
    triggerApps: TICKET_SYSTEMS,
    actionApps: TICKET_SYSTEMS,
    extraApps: AI_TOOLS,
    tags: ['support', 'routing', 'ai', 'classification'],
    useCases: ['auto-route to right team', 'reduce manual triage'],
    build: (c) => ({
      scenario_name: `AI-routed ${c.trigger.display} ticket → team assignment`,
      one_line_summary: `Classify ${c.trigger.display} tickets with ${c.extras[0]?.display ?? 'OpenAI'} and auto-assign to the matching support team`,
      business_purpose: `Eliminates the daily 30-minute manual triage by L1 support. New tickets are classified into ~10 buckets (billing, bug, feature-request, onboarding, etc.) by an LLM and assigned to the right specialist team. Confidence below 70% goes to human triage queue.`,
      full_description: `${c.trigger.display} webhook on ticket creation. Pulls subject + body + any tags. Sends to ${c.extras[0]?.display ?? 'OpenAI'} with a classification prompt that returns { category, confidence, suggested_priority }. If confidence > 70%, applies the routing rule (Data Store lookup category → team). Otherwise leaves in unassigned. Logs classification for accuracy review.`,
      data_flow: `${c.trigger.display} ticket-created → Extract content → ${c.extras[0]?.display ?? 'OpenAI'} classify → Confidence router → Apply team via ticket-update API → Log to classification audit table`,
      trigger_event: `${c.trigger.display}: ticket created`,
      error_handling: `LLM timeout (5s) → leave unassigned, post to triage queue. LLM 429 → retry with backoff up to 3x.`,
      reuse_notes: `Track classification accuracy weekly. Add a feedback loop where reassigned tickets become training data. Swap GPT for Claude if cost matters.`,
      branches: [
        { condition: 'classification confidence >= 70%', path_true: 'auto-assign team', path_false: 'leave for human triage' },
      ],
    }),
  },
  {
    family: 'support',
    templateId: 'sla-breach-escalation',
    category: 'support',
    complexity: 'complex',
    triggerType: 'scheduled',
    triggerApps: TICKET_SYSTEMS,
    actionApps: NOTIFY_CHANNELS,
    tags: ['support', 'sla', 'escalation', 'alerts'],
    useCases: ['prevent SLA breaches', 'auto-escalate stale tickets'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} SLA monitor → ${c.action.display} escalation`,
      one_line_summary: `Every 5 minutes, scan ${c.trigger.display} for tickets approaching SLA breach and escalate via ${c.action.display}`,
      business_purpose: `Catches SLA breaches before they happen. Every 5 min the scenario lists tickets with first-response or resolution-deadline in <30 min and not yet acted on. Escalates to the team channel and pages the assignee. Big customer-trust win.`,
      full_description: `Schedule every 5 min. Query ${c.trigger.display} for open tickets where (deadline - now) < 30 min AND last_actor != agent. For each result, post to ${c.action.display} with the ticket link, time remaining, and assignee mention. Maintains a "warned" Data Store so we don't ping twice per breach.`,
      data_flow: `Schedule (5m) → ${c.trigger.display} list-open-tickets query → Filter deadline approaching → Check warned-cache → ${c.action.display} escalate → Mark warned`,
      trigger_event: `Scheduled every 5 minutes`,
      error_handling: `Cache TTL of 4 hours so warned-flag clears. If notify fails, log and continue.`,
      reuse_notes: `Tier the escalation: 30m → agent channel, 15m → manager DM, 5m → page on-call. Configure SLA windows per customer tier in a Data Store.`,
      branches: [
        { condition: 'time to deadline < 15 minutes', path_true: 'page manager directly', path_false: 'post to team channel' },
      ],
    }),
  },
  {
    family: 'support',
    templateId: 'csat-survey-flow',
    category: 'support',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: TICKET_SYSTEMS,
    actionApps: FORMS,
    tags: ['support', 'csat', 'survey', 'feedback'],
    useCases: ['measure customer satisfaction', 'collect qualitative feedback'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} ticket closed → ${c.action.display} CSAT`,
      one_line_summary: `Send a ${c.action.display} CSAT survey 1 hour after every ${c.trigger.display} ticket closes`,
      business_purpose: `Continuous customer satisfaction measurement without manual sending. The 1-hour delay gives the customer time to confirm the fix worked. Responses are written back to the ticket so support managers see context alongside ratings.`,
      full_description: `${c.trigger.display} ticket-resolved webhook → Sleep 1 hour → Build personalised ${c.action.display} link with ticket-id + customer-id query params → Email or post-message via the customer's preferred channel. Survey response webhook fires a second scenario that appends the rating + comment back to the ticket.`,
      data_flow: `${c.trigger.display} ticket-resolved → Delay 1h → Generate survey URL → Email/post to customer → (later) ${c.action.display} response webhook → Update ticket`,
      trigger_event: `${c.trigger.display}: ticket status = Resolved`,
      error_handling: `Don't send survey if ticket was reopened during the 1h delay. Idempotent ticket-update on response.`,
      reuse_notes: `Skip survey for internal tickets. A/B test wording — send variant A on odd-id tickets, B on even.`,
      branches: [
        { condition: 'customer tier >= Pro', path_true: 'send long-form survey', path_false: 'send 1-question NPS' },
      ],
    }),
  },

  // ─── Marketing cluster (3) ───
  {
    family: 'marketing',
    templateId: 'blog-to-social',
    category: 'marketing',
    complexity: 'simple',
    triggerType: 'polling',
    triggerApps: [
      { key: 'webflow', display: 'Webflow CMS' },
      { key: 'contentful', display: 'Contentful' },
      { key: 'wordpress', display: 'WordPress' },
      { key: 'notion', display: 'Notion' },
      { key: 'sanity', display: 'Sanity' },
      { key: 'ghost', display: 'Ghost' },
    ],
    actionApps: SOCIAL,
    tags: ['marketing', 'content', 'social', 'distribution'],
    useCases: ['amplify content reach', 'consistent posting cadence'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} blog post → ${c.action.display}`,
      one_line_summary: `Auto-publish new ${c.trigger.display} blog posts to ${c.action.display} with title + featured image`,
      business_purpose: `Every new blog post gets cross-posted to ${c.action.display} within minutes, with a hand-tuned variant of the title and the featured image. Marketing stops having to remember to "tweet about that post."`,
      full_description: `Polls ${c.trigger.display} every 10 min for new posts. For each new post, generates a tweet-length headline (truncated if needed), pulls the featured image, and posts to ${c.action.display}. Tracks posted_post_ids in a Data Store to avoid duplicate posts on poll-restart.`,
      data_flow: `Schedule 10m → ${c.trigger.display} new-posts query → For each: format headline + image → ${c.action.display} post → Append to posted-store`,
      trigger_event: `Scheduled every 10 minutes`,
      error_handling: `Posted-store is the source of truth — never repost. Social rate-limit retries with backoff.`,
      reuse_notes: `Add an AI step that rewrites the headline for each platform (X is more direct, LinkedIn more professional). UTM the link per channel.`,
      branches: [],
    }),
  },
  {
    family: 'marketing',
    templateId: 'webinar-reminder-sequence',
    category: 'marketing',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: [
      { key: 'zoom', display: 'Zoom' },
      { key: 'on24', display: 'ON24' },
      { key: 'goldcast', display: 'Goldcast' },
      { key: 'demio', display: 'Demio' },
      { key: 'livestorm', display: 'Livestorm' },
    ],
    actionApps: MARKETING_PLATFORMS,
    tags: ['marketing', 'webinar', 'events', 'email'],
    useCases: ['drive webinar attendance', 'event lifecycle automation'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} registration → ${c.action.display} reminder sequence`,
      one_line_summary: `Trigger a multi-touch reminder sequence in ${c.action.display} on every ${c.trigger.display} webinar registration`,
      business_purpose: `Webinar attendance rates jump from ~30% to ~55% when reminder cadence is right. This scenario fires a 4-touch sequence: confirmation, day-before, hour-before, 5-min-before. Each touch is routed to the registrant's preferred channel (email or SMS).`,
      full_description: `${c.trigger.display} sends a webhook on registration. The scenario adds the registrant to a ${c.action.display} sequence list "Webinar-{webinar_id}-Reminders". The sequence in ${c.action.display} handles the scheduling. Post-webinar a separate scenario fires the "watched" or "missed" follow-up based on attendance data.`,
      data_flow: `${c.trigger.display} registration webhook → Map fields → ${c.action.display} add-to-sequence`,
      trigger_event: `${c.trigger.display}: registration created`,
      error_handling: `Dedupe by email (registration could be re-submitted). Failed add-to-sequence triggers a Slack alert to marketing ops.`,
      reuse_notes: `Configurable sequence per webinar — pass sequence_id as a webhook query param.`,
      branches: [
        { condition: 'registrant is existing customer', path_true: 'add to product-deep-dive sequence', path_false: 'add to top-of-funnel sequence' },
      ],
    }),
  },
  {
    family: 'marketing',
    templateId: 'lead-scoring-handoff',
    category: 'marketing',
    complexity: 'complex',
    triggerType: 'webhook',
    triggerApps: MARKETING_PLATFORMS,
    actionApps: CRMS,
    extraApps: NOTIFY_CHANNELS,
    tags: ['marketing', 'lead-scoring', 'mql-to-sql', 'sales-handoff'],
    useCases: ['mql to sql conversion', 'rep notification'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} lead score change → ${c.action.display} handoff`,
      one_line_summary: `When a ${c.trigger.display} lead crosses MQL threshold, push to ${c.action.display} and ping the owner`,
      business_purpose: `Bridges the marketing → sales handoff. As soon as a lead score crosses the MQL threshold in ${c.trigger.display}, the scenario converts them to a sales-qualified contact in ${c.action.display}, assigns the right owner (territory rules), and pings the owner in ${c.extras[0]?.display ?? 'Slack'} with full context.`,
      full_description: `${c.trigger.display} webhook fires on score threshold cross. Scenario fetches full marketing engagement history (page views, email opens, content downloads). Upserts the contact in ${c.action.display} as a "Sales Qualified Lead" with lifecycle stage updated. Applies territory routing → assigned owner. Posts a rich ${c.extras[0]?.display ?? 'Slack'} message with the engagement summary + a "Take it" button that updates ownership in CRM via webhook.`,
      data_flow: `${c.trigger.display} score-threshold webhook → Fetch engagement history → ${c.action.display} upsert (SQL stage) → Territory routing → ${c.extras[0]?.display ?? 'Slack'} DM owner`,
      trigger_event: `${c.trigger.display}: lead score crossed MQL threshold`,
      error_handling: `If territory rule has no match, fall back to default queue. Slack DM failure logged but scenario succeeds.`,
      reuse_notes: `Configurable MQL threshold per campaign — store thresholds in a Data Store. Add a Clearbit enrichment step before routing for company-size-based assignment.`,
      branches: [
        { condition: 'company size >= 500', path_true: 'enterprise rep queue', path_false: 'SMB queue' },
      ],
    }),
  },

  // ─── Finance / Billing cluster (3) ───
  {
    family: 'finance',
    templateId: 'payment-success-log',
    category: 'finance',
    complexity: 'simple',
    triggerType: 'webhook',
    triggerApps: PAYMENTS,
    actionApps: DATA_STORES,
    extraApps: NOTIFY_CHANNELS,
    tags: ['finance', 'billing', 'logging', 'audit'],
    useCases: ['payment audit trail', 'real-time revenue tracking'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} payment → ${c.action.display} ledger`,
      one_line_summary: `Log every successful ${c.trigger.display} payment as a row in ${c.action.display} for finance reporting`,
      business_purpose: `Finance gets an immediate audit trail outside the payment provider. Useful for monthly reconciliation, tax reporting, and downstream BI without granting raw ${c.trigger.display} access to the finance team.`,
      full_description: `${c.trigger.display} webhook on payment_intent.succeeded fires the scenario. Extracts amount, currency, customer_id, subscription_id, invoice_id, fee, net. Inserts a row in ${c.action.display}. Optionally posts a "💰 $X received from Y" message to a #revenue channel.`,
      data_flow: `${c.trigger.display} payment-succeeded webhook → Extract fields → ${c.action.display} insert → ${c.extras[0]?.display ?? 'Slack'} #revenue post`,
      trigger_event: `${c.trigger.display}: payment.succeeded`,
      error_handling: `Idempotency-key on insert (use payment_intent_id) prevents duplicates from webhook retries.`,
      reuse_notes: `Add a currency-conversion step for multi-currency orgs — fetch rate from Open Exchange Rates and store both original + converted.`,
      branches: [],
    }),
  },
  {
    family: 'finance',
    templateId: 'failed-payment-dunning',
    category: 'finance',
    complexity: 'complex',
    triggerType: 'webhook',
    triggerApps: PAYMENTS,
    actionApps: MARKETING_PLATFORMS,
    extraApps: CRMS,
    tags: ['finance', 'dunning', 'churn', 'recovery'],
    useCases: ['recover failed payments', 'reduce involuntary churn'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} failed payment → ${c.action.display} dunning`,
      one_line_summary: `Launch a smart dunning sequence in ${c.action.display} on every ${c.trigger.display} payment failure`,
      business_purpose: `Recover 30%+ of failed subscription payments. The scenario detects payment failure reason (insufficient funds, expired card, fraud block) and routes to the matching sequence — different copy for "expired card" vs "insufficient funds" recovers more.`,
      full_description: `${c.trigger.display} invoice.payment_failed webhook → Fetch failure reason → Router based on reason → Add to matching ${c.action.display} sequence (Update Card / Try Again Later / High-Risk Review) → Update CRM contact with at-risk flag → Slack notify CS team for VIP customers.`,
      data_flow: `${c.trigger.display} payment-failed → Reason router → ${c.action.display} sequence → ${c.extras[0]?.display ?? 'CRM'} at-risk flag → Slack CS alert (VIP only)`,
      trigger_event: `${c.trigger.display}: invoice.payment_failed`,
      error_handling: `Retry sequence assignment up to 3x. If customer is in cancellation-pending state, skip the dunning to avoid harassing.`,
      reuse_notes: `Add a "smart retry" branch — for insufficient funds, schedule a retry for the customer's typical payday based on their historical payment day. Saves another 5-10% recovery.`,
      branches: [
        { condition: 'failure reason = expired_card', path_true: 'send "update card" sequence', path_false: 'send "payment retry" sequence' },
      ],
    }),
  },
  {
    family: 'finance',
    templateId: 'invoice-to-accounting',
    category: 'finance',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: PAYMENTS,
    actionApps: PAYMENTS,
    tags: ['finance', 'accounting', 'invoicing', 'sync'],
    useCases: ['sync payment provider to accounting', 'monthly close prep'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} invoice → ${c.action.display}`,
      one_line_summary: `Mirror every ${c.trigger.display} invoice into ${c.action.display} for monthly close`,
      business_purpose: `Eliminates the manual export-and-import dance at month-end. Every invoice issued in ${c.trigger.display} appears in ${c.action.display} within minutes, mapped to the right revenue account based on product → account rules.`,
      full_description: `${c.trigger.display} invoice.finalized webhook → Extract line items → Look up product → revenue account mapping in Data Store → Create matching invoice in ${c.action.display} with same number for audit trail → Mark synced in ${c.trigger.display} via metadata.`,
      data_flow: `${c.trigger.display} invoice-finalized → Product-to-account mapping → ${c.action.display} create-invoice`,
      trigger_event: `${c.trigger.display}: invoice.finalized`,
      error_handling: `Unknown product → assign to "Uncategorised Revenue" + Slack #finance for review. Duplicate invoice number → log + skip.`,
      reuse_notes: `Add tax-jurisdiction routing for multi-region orgs. Different VAT rules per country mean different revenue accounts.`,
      branches: [],
    }),
  },

  // ─── E-commerce cluster (3) ───
  {
    family: 'ecommerce',
    templateId: 'order-fulfillment',
    category: 'ecommerce',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: ECOMMERCE,
    actionApps: FILE_STORAGE,
    extraApps: NOTIFY_CHANNELS,
    tags: ['ecommerce', 'fulfillment', 'orders'],
    useCases: ['order processing automation', 'shipping label generation'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} order → fulfillment workflow`,
      one_line_summary: `On every new ${c.trigger.display} order, generate a packing slip in ${c.action.display} and notify the warehouse`,
      business_purpose: `Replaces the manual "check Shopify every hour, generate packing slip, paste into ShipStation" workflow. Orders flow to fulfillment within 60 seconds, with packing slips auto-generated as PDF and stored in ${c.action.display}.`,
      full_description: `${c.trigger.display} order/created webhook → Extract line items, customer, shipping address → Generate packing slip PDF (HTML → PDF service) → Upload to ${c.action.display} in /orders/{date}/{order_id}.pdf → Post link + summary to ${c.extras[0]?.display ?? 'Slack'} #warehouse channel.`,
      data_flow: `${c.trigger.display} order-created → Build PDF → ${c.action.display} upload → ${c.extras[0]?.display ?? 'Slack'} #warehouse notify`,
      trigger_event: `${c.trigger.display}: order created`,
      error_handling: `PDF generation timeout → retry once, then post raw order details to channel as fallback. Idempotent on order_id.`,
      reuse_notes: `Add label-printer integration (ShipStation, EasyPost) for direct shipping label printing. Branch by destination country for customs paperwork.`,
      branches: [
        { condition: 'shipping to international destination', path_true: 'add customs declaration', path_false: 'standard label only' },
      ],
    }),
  },
  {
    family: 'ecommerce',
    templateId: 'abandoned-cart',
    category: 'ecommerce',
    complexity: 'medium',
    triggerType: 'scheduled',
    triggerApps: ECOMMERCE,
    actionApps: MARKETING_PLATFORMS,
    tags: ['ecommerce', 'cart-recovery', 'email', 'retention'],
    useCases: ['recover abandoned carts', 'increase conversion rate'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} abandoned cart → ${c.action.display} recovery`,
      one_line_summary: `Every 30 min scan ${c.trigger.display} for abandoned carts older than 1h and trigger a recovery email via ${c.action.display}`,
      business_purpose: `Recovers 10-15% of abandoned cart revenue. Three-touch sequence (1h, 24h, 72h) with progressively higher incentives — first touch just reminder, second touch 5% off, third touch 10% off. Stops the moment the customer completes the purchase.`,
      full_description: `Schedule 30m → ${c.trigger.display} list checkouts with status=abandoned AND age > 1h → For each: check Data Store for "already-emailed" → if not, add to ${c.action.display} sequence "Cart-Recovery" with cart-restore link → Mark emailed in Data Store.`,
      data_flow: `Schedule 30m → ${c.trigger.display} abandoned-checkouts query → Dedupe → ${c.action.display} sequence add`,
      trigger_event: `Scheduled every 30 minutes`,
      error_handling: `Cap recovery emails at 3 per customer per month to avoid spam complaints. Skip if customer has unsubscribed.`,
      reuse_notes: `Personalise discount by cart value — high-value carts get higher discount. Tag the recovered order in CRM for LTV reporting.`,
      branches: [
        { condition: 'cart value >= $200', path_true: 'send 10% off offer', path_false: 'send 5% off offer' },
      ],
    }),
  },
  {
    family: 'ecommerce',
    templateId: 'low-inventory-alert',
    category: 'ecommerce',
    complexity: 'simple',
    triggerType: 'scheduled',
    triggerApps: ECOMMERCE,
    actionApps: NOTIFY_CHANNELS,
    tags: ['ecommerce', 'inventory', 'alerts', 'ops'],
    useCases: ['prevent stockouts', 'inventory reorder workflow'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} low inventory → ${c.action.display} reorder alert`,
      one_line_summary: `Daily scan of ${c.trigger.display} for SKUs below reorder threshold, post to ${c.action.display}`,
      business_purpose: `Catches inventory issues before customers do. Each morning the scenario lists SKUs that are below their per-SKU reorder threshold (stored in a Data Store) and posts a summary to the ops ${c.action.display} channel with quantity needed.`,
      full_description: `Daily schedule (08:00 local) → ${c.trigger.display} inventory query → Join with reorder-threshold Data Store → Filter where qty_on_hand < threshold → Group by category → ${c.action.display} post with table.`,
      data_flow: `Schedule daily 08:00 → ${c.trigger.display} inventory query → Threshold join → ${c.action.display} post`,
      trigger_event: `Scheduled daily at 08:00 local time`,
      error_handling: `If query fails, retry once after 5 min and skip the day if still failing — next-day alert will catch it.`,
      reuse_notes: `Add a "place order" button that fires a separate scenario calling the supplier API. Threshold per SKU can vary by season — use a date-aware lookup.`,
      branches: [],
    }),
  },

  // ─── Data sync cluster (2) ───
  {
    family: 'data-sync',
    templateId: 'sheets-to-warehouse',
    category: 'data-sync',
    complexity: 'medium',
    triggerType: 'scheduled',
    triggerApps: DATA_STORES,
    actionApps: DATA_STORES,
    tags: ['data-sync', 'etl', 'warehouse'],
    useCases: ['centralised reporting', 'BI source of truth'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} → ${c.action.display} nightly sync`,
      one_line_summary: `Mirror ${c.trigger.display} tables to ${c.action.display} every night for analytics`,
      business_purpose: `Centralises ${c.trigger.display} data into ${c.action.display} so BI tools have a single source of truth. Replaces fragile manual exports — runs at 02:00 daily and finishes before the EU business day starts.`,
      full_description: `Daily 02:00 schedule → For each configured table: query ${c.trigger.display} for rows updated since last sync (cursor in Data Store) → Map columns to ${c.action.display} schema → Bulk upsert in batches of 1000 → Update cursor on success.`,
      data_flow: `Schedule 02:00 → ${c.trigger.display} cursor-based query → Map schema → ${c.action.display} bulk upsert → Advance cursor`,
      trigger_event: `Scheduled daily at 02:00 UTC`,
      error_handling: `Cursor only advances on full success. Partial failure → retry the same window next run. Daily Slack summary of rows synced + errors.`,
      reuse_notes: `Add full-refresh mode for the 1st of each month to catch any drift. Snapshot schema mappings to git for audit.`,
      branches: [],
    }),
  },
  {
    family: 'data-sync',
    templateId: 'crm-to-warehouse-stream',
    category: 'data-sync',
    complexity: 'complex',
    triggerType: 'webhook',
    triggerApps: CRMS,
    actionApps: DATA_STORES,
    tags: ['data-sync', 'cdc', 'real-time'],
    useCases: ['real-time analytics', 'event-driven warehouse'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} change events → ${c.action.display} stream`,
      one_line_summary: `Stream ${c.trigger.display} field-change events into ${c.action.display} for real-time dashboards`,
      business_purpose: `Real-time alternative to nightly batch ETL. Every field change in ${c.trigger.display} flows to ${c.action.display} as an append-only event log within seconds. Powers leadership dashboards that need sub-minute pipeline freshness.`,
      full_description: `${c.trigger.display} change-event webhook → Transform to a canonical event shape (entity_type, entity_id, field, old_value, new_value, changed_at, changed_by) → Append to ${c.action.display} events table (no upsert, pure log) → Downstream dbt models build the dimensional views.`,
      data_flow: `${c.trigger.display} change webhook → Normalise event → ${c.action.display} append`,
      trigger_event: `${c.trigger.display}: any field change`,
      error_handling: `If warehouse write fails, queue event in a Data Store fallback table and retry every minute. Alert if backlog > 100 events.`,
      reuse_notes: `Add an "events to mart" downstream scenario that periodically materialises a current-state table for BI tools that don't handle event-sourced data well.`,
      branches: [],
    }),
  },

  // ─── DevOps / Engineering (3) ───
  {
    family: 'devops',
    templateId: 'pr-opened-review',
    category: 'devops',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: DEVOPS,
    actionApps: NOTIFY_CHANNELS,
    extraApps: AI_TOOLS,
    tags: ['devops', 'code-review', 'engineering'],
    useCases: ['faster code review', 'reviewer assignment'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} PR opened → ${c.action.display} routing`,
      one_line_summary: `On new ${c.trigger.display} PR, AI-summarise the diff and route to the right reviewer in ${c.action.display}`,
      business_purpose: `Cuts PR-to-first-review time by 60%. Auto-assigns reviewers based on touched files (CODEOWNERS-style lookup) and posts an AI-generated one-paragraph summary so reviewers know the gist before clicking through.`,
      full_description: `${c.trigger.display} pull_request.opened webhook → Fetch diff stats + changed files → Look up owners from a Data Store mapping (path-glob → user) → AI-summarise PR title + description → Post to ${c.action.display} with reviewer @-mentions + summary.`,
      data_flow: `${c.trigger.display} PR-opened → File ownership lookup → ${c.extras[0]?.display ?? 'OpenAI'} summarise → ${c.action.display} post w/ mentions`,
      trigger_event: `${c.trigger.display}: pull_request.opened`,
      error_handling: `If no owner matches the file paths, mention the engineering manager. AI failure → post without summary.`,
      reuse_notes: `Add a "stale PR" companion scenario (24h since last activity → re-ping). Track average time-to-first-review per team.`,
      branches: [],
    }),
  },
  {
    family: 'devops',
    templateId: 'sentry-incident-page',
    category: 'devops',
    complexity: 'complex',
    triggerType: 'webhook',
    triggerApps: DEVOPS,
    actionApps: NOTIFY_CHANNELS,
    tags: ['devops', 'incident', 'monitoring', 'on-call'],
    useCases: ['incident response', 'on-call paging'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} alert → ${c.action.display} incident routing`,
      one_line_summary: `Route ${c.trigger.display} alerts to ${c.action.display} with severity-based escalation`,
      business_purpose: `Cuts MTTR by ensuring the right person hears about the right incident within seconds. Severity routing means a critical alert pages the on-call directly while a warning lands in a team channel for next-business-day review.`,
      full_description: `${c.trigger.display} alert webhook → Severity router (critical/error/warning) → Critical: page primary on-call via PagerDuty + post to #incidents + create war-room channel → Error: post to team channel with @engineering mention → Warning: log to triage queue.`,
      data_flow: `${c.trigger.display} alert → Severity router → ${c.action.display} (channel + ping + war-room)`,
      trigger_event: `${c.trigger.display}: alert fired`,
      error_handling: `On-call schedule lookup failure → page the engineering manager as fallback. Don't auto-resolve — humans close incidents.`,
      reuse_notes: `Add a "post-incident" branch that creates a postmortem doc template + Notion page after resolution. Auto-link to the originating alert.`,
      branches: [
        { condition: 'severity = critical', path_true: 'page on-call + war room', path_false: 'team channel ping' },
      ],
    }),
  },
  {
    family: 'devops',
    templateId: 'build-failed-alert',
    category: 'devops',
    complexity: 'simple',
    triggerType: 'webhook',
    triggerApps: DEVOPS,
    actionApps: NOTIFY_CHANNELS,
    tags: ['devops', 'ci', 'build'],
    useCases: ['fast build failure feedback'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} build failed → ${c.action.display}`,
      one_line_summary: `Alert the author in ${c.action.display} the moment their ${c.trigger.display} build fails`,
      business_purpose: `Author finds out their PR build is red within seconds instead of next morning. Direct DM (not a channel) because failures shouldn't spam everyone.`,
      full_description: `${c.trigger.display} build/failed webhook → Fetch commit author email → Look up ${c.action.display} user by email → DM with build URL, error excerpt, and a "Re-run" button.`,
      data_flow: `${c.trigger.display} build-failed → Author lookup → ${c.action.display} DM`,
      trigger_event: `${c.trigger.display}: build status = failed`,
      error_handling: `Unknown author → post to engineering channel.`,
      reuse_notes: `Suppress repeated alerts for the same commit (don't re-DM on flaky-test retries that also fail).`,
      branches: [],
    }),
  },

  // ─── HR / Internal (2) ───
  {
    family: 'hr',
    templateId: 'new-hire-onboarding',
    category: 'hr',
    complexity: 'complex',
    triggerType: 'webhook',
    triggerApps: HR_SYSTEMS,
    actionApps: NOTIFY_CHANNELS,
    extraApps: FILE_STORAGE,
    tags: ['hr', 'onboarding', 'access-provisioning'],
    useCases: ['new hire automation', 'access provisioning'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} new hire → onboarding orchestration`,
      one_line_summary: `Trigger the full onboarding workflow on every ${c.trigger.display} new-hire event`,
      business_purpose: `Day-one productivity. New hires get accounts provisioned (Google, Slack, GitHub, 1Password), buddy assigned, welcome email sent, and a personalised first-day doc created — all from a single ${c.trigger.display} record creation, no IT ticket required.`,
      full_description: `${c.trigger.display} employee.created webhook → Parallel router: (a) Create Google Workspace account + add to default groups, (b) Invite to ${c.action.display} + add to team channels, (c) Provision GitHub seat + add to team, (d) Create 1Password vault access, (e) Generate first-day doc in ${c.extras[0]?.display ?? 'Drive'} from template, (f) Assign buddy from a Data Store rotation, (g) Send welcome email with all links.`,
      data_flow: `${c.trigger.display} new-hire → Parallel (Google + ${c.action.display} + GitHub + 1Password + ${c.extras[0]?.display ?? 'Drive'} doc + buddy + email)`,
      trigger_event: `${c.trigger.display}: employee created`,
      error_handling: `Any branch failure posts to #people-ops with the specific step that failed and a retry button. Idempotent on employee_id.`,
      reuse_notes: `Add a department-aware router — engineering gets GitHub + AWS, sales gets Salesforce + ZoomInfo. Different welcome doc templates per role.`,
      branches: [
        { condition: 'department = Engineering', path_true: 'provision GitHub + AWS', path_false: 'standard access set' },
      ],
    }),
  },
  {
    family: 'hr',
    templateId: 'pto-request',
    category: 'hr',
    complexity: 'medium',
    triggerType: 'webhook',
    triggerApps: HR_SYSTEMS,
    actionApps: CALENDARS,
    extraApps: NOTIFY_CHANNELS,
    tags: ['hr', 'pto', 'calendar', 'time-off'],
    useCases: ['PTO approval workflow', 'calendar blocking'],
    build: (c) => ({
      scenario_name: `${c.trigger.display} PTO approved → ${c.action.display} block`,
      one_line_summary: `On ${c.trigger.display} PTO approval, block ${c.action.display} dates and notify the team`,
      business_purpose: `Approved PTO automatically shows up on the team calendar so colleagues can plan around it — no manual "I'll be out next week" email. Out-of-office responder configured too if requested.`,
      full_description: `${c.trigger.display} pto.approved webhook → Create all-day events on the requester's ${c.action.display} for each day → Block manager's calendar if "coverage required" flagged → Post to team ${c.extras[0]?.display ?? 'Slack'} channel "@Alex is out Mon-Fri next week" → Configure OOO responder if requested in PTO form.`,
      data_flow: `${c.trigger.display} PTO-approved → ${c.action.display} create-events → Manager calendar (if coverage flag) → ${c.extras[0]?.display ?? 'Slack'} team notify → OOO setup`,
      trigger_event: `${c.trigger.display}: PTO status = Approved`,
      error_handling: `Skip OOO setup if request is for past dates. Calendar event creation failure logged to #people-ops.`,
      reuse_notes: `Add a "coverage check" branch — if requester is sole owner of a project, prompt for coverage assignment before approval. Integrate with project-management tool.`,
      branches: [
        { condition: 'PTO duration > 5 days', path_true: 'manager calendar block + coverage check', path_false: 'team calendar block only' },
      ],
    }),
  },
]

// ──────────────────────────────────────────────────────────
// Generation
// ──────────────────────────────────────────────────────────

function pickN<T>(arr: T[], n: number, offset = 0): T[] {
  if (arr.length === 0) return []
  const out: T[] = []
  for (let i = 0; i < n; i++) {
    out.push(arr[(offset + i) % arr.length]!)
  }
  return out
}

function buildEmbeddingInputFor(row: ReturnType<Archetype['build']>, apps_involved: string[], category: string, trigger_app: string, trigger_type: string, trigger_event: string, tags: string[], use_cases: string[], makeDescription?: string | null): string {
  const humanDesc = makeDescription?.trim() ? `${makeDescription.trim()}. ${makeDescription.trim()}. ` : ''
  return [
    humanDesc,
    `${row.one_line_summary}.`,
    row.business_purpose,
    row.full_description,
    row.data_flow,
    `Apps: ${apps_involved.join(', ')}.`,
    `Tags: ${tags.join(', ')}.`,
    `Use cases: ${use_cases.join(', ')}.`,
    `Category: ${category}.`,
    `Trigger: ${trigger_event} via ${trigger_app} (${trigger_type}).`,
  ].join(' ')
}

interface GenArgs {
  count: number
  dryRun: boolean
  purge: boolean
}

function parseArgs(): GenArgs {
  const args: GenArgs = { count: 500, dryRun: false, purge: false }
  for (const a of process.argv.slice(2)) {
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--purge') args.purge = true
    else if (a.startsWith('--count=')) args.count = Number(a.slice('--count='.length))
  }
  return args
}

async function main() {
  const args = parseArgs()
  const supa = createServiceClient()

  // Look up the UUID org_id for the configured Make org so synthetic rows pass RLS.
  // Without this, authenticated users can't see synthetic rows even with ?include_demo=1.
  const targetMakeOrgId = process.env.MAKE_DEFAULT_ORG_ID ?? null
  let targetOrgUuid: string | null = null
  if (targetMakeOrgId) {
    const { data } = await supa
      .from('make_organizations')
      .select('id')
      .eq('make_org_id', targetMakeOrgId)
      .maybeSingle<{ id: string }>()
    targetOrgUuid = data?.id ?? null
    if (!targetOrgUuid && !args.purge) {
      console.warn(
        `⚠️  No make_organizations row for MAKE_DEFAULT_ORG_ID=${targetMakeOrgId}. ` +
          `Synthetic rows will have org_id NULL and be invisible behind RLS. ` +
          `Run \`pnpm ingest:backfill --limit=1\` first to seed the org row.`,
      )
    }
  }

  if (args.purge) {
    console.log('Purging all synthetic scenarios…')
    const { error, count } = await supa.from('make_scenarios').delete({ count: 'exact' }).eq('is_synthetic', true)
    if (error) {
      console.error('Purge failed:', error.message)
      process.exit(1)
    }
    console.log(`Deleted ${count ?? 0} synthetic rows.`)
    return
  }

  // Build all variants across archetypes. We collect into per-archetype buckets first,
  // then round-robin merge so the count cap doesn't starve later archetype families.
  const buckets: Array<Array<Omit<Insert, 'embedding'> & { _embed_input: string }>> = ARCHETYPES.map(() => [])
  const synthOrgId = process.env.MAKE_DEFAULT_ORG_ID ?? '0'

  ARCHETYPES.forEach((arch, archIdx) => {
    // For each trigger × action combo (capped to keep balanced across archetypes).
    let offset = 0
    for (const trigger of arch.triggerApps) {
      for (const action of arch.actionApps) {
        if (trigger.key === action.key) continue // skip self-to-self
        const extras = arch.extraApps ? pickN(arch.extraApps, 1, offset++) : []
        const combo: AppCombo = { trigger, action, extras }
        const r = arch.build(combo)
        const apps_involved = [trigger.key, action.key, ...extras.map((e) => e.key)]
        const synthScenId = `synth-${arch.templateId}-${trigger.key}-${action.key}`

        // A short "human description" for half the rows, simulating MCP-created scenarios.
        const isMcpStyle = (offset % 2) === 0
        const make_description = isMcpStyle
          ? `${r.one_line_summary} (generated via Make MCP)`
          : null

        buckets[archIdx]!.push({
          make_scenario_id: synthScenId,
          scenario_name: r.scenario_name,
          one_line_summary: r.one_line_summary,
          business_purpose: r.business_purpose,
          full_description: r.full_description,
          data_flow: r.data_flow,
          reuse_notes: r.reuse_notes,
          error_handling: r.error_handling,
          branches_summary: r.branches as unknown as Insert['branches_summary'],
          apps_involved: apps_involved as unknown as Insert['apps_involved'],
          trigger_app: trigger.key,
          trigger_event: r.trigger_event,
          trigger_type: arch.triggerType,
          category: arch.category,
          complexity: arch.complexity,
          tags: arch.tags as unknown as Insert['tags'],
          use_cases: arch.useCases as unknown as Insert['use_cases'],
          make_org_id: String(synthOrgId),
          org_id: targetOrgUuid, // links to real org via UUID so RLS lets authed users see them
          team_name: `Synthetic - ${arch.family}`,
          make_team_id: `synth-team-${arch.family}`,
          make_description,
          llm_model_used: 'synthetic-generator',
          llm_prompt_version: 'synthetic-v1',
          llm_analysis_json: { _synthetic: true, archetype: arch.templateId } as unknown as Insert['llm_analysis_json'],
          analyzed_at: new Date().toISOString(),
          reanalyzed_at: new Date().toISOString(),
          is_synthetic: true,
          blueprint_hash: `synth-${arch.templateId}-${trigger.key}-${action.key}`,
          _embed_input: buildEmbeddingInputFor(
            r,
            apps_involved,
            arch.category,
            trigger.key,
            arch.triggerType,
            r.trigger_event,
            arch.tags,
            arch.useCases,
            make_description,
          ),
        })
      }
    }
  })

  // Round-robin merge buckets so families get fair representation under the count cap.
  const rows: Array<Omit<Insert, 'embedding'> & { _embed_input: string }> = []
  let added = true
  let pos = 0
  while (added) {
    added = false
    for (const b of buckets) {
      if (pos < b.length) {
        rows.push(b[pos]!)
        added = true
      }
    }
    pos++
  }

  console.log(`Built ${rows.length} candidate rows across ${ARCHETYPES.length} archetypes.`)

  // Trim to hit target count (round-robin order = fair distribution).
  const target = Math.min(args.count, rows.length)
  rows.length = target
  console.log(`Target: ${target} rows. Embedding…`)

  // Embed in batches of 100.
  const BATCH = 100
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH)
    const inputs = chunk.map((r) => r._embed_input)
    const embeds = await embedBatch(inputs)
    chunk.forEach((r, j) => {
      // Attach vector to the row as Postgres text format.
      ;(r as unknown as { embedding: string }).embedding = `[${embeds[j]!.vector.join(',')}]`
      delete (r as Record<string, unknown>)._embed_input
    })
    console.log(`  embedded ${Math.min(i + BATCH, rows.length)}/${rows.length}`)
  }

  if (args.dryRun) {
    console.log('Dry-run — no DB writes. Sample row:')
    const sample = { ...rows[0] }
    delete (sample as Record<string, unknown>).embedding // huge, skip
    console.log(JSON.stringify(sample, null, 2))
    return
  }

  // Insert in batches of 10 — rows are large (1536-dim embedding vector as text per row).
  let inserted = 0
  const INSERT_BATCH = 10
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH).map((r) => {
      const { _embed_input, ...rest } = r as typeof r & { _embed_input?: string }
      void _embed_input
      return rest
    })
    const { error } = await supa
      .from('make_scenarios')
      .upsert(chunk as unknown as Insert[], { onConflict: 'make_scenario_id' })
    if (error) {
      console.error(`Insert batch ${i / INSERT_BATCH} failed:`, error.message)
      process.exit(1)
    }
    inserted += chunk.length
    console.log(`  inserted ${inserted}/${rows.length}`)
  }

  console.log(`\n✓ Inserted ${inserted} synthetic scenarios.`)
  console.log(`  View at /browse?include_demo=1 (toggle to show)`)
  console.log(`  Purge: pnpm tsx scripts/generate-synthetic-scenarios.ts --purge`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
