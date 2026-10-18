\# LingoFlow execution plan

> **Implementation progress — 2026-10-19**
>
> - Phase 0: **complete** — repository foundation, runtime pin, Docker, offline checks, and project documentation. Commit `08e9eef`.
> - Phase 1: **complete** — domain contracts, evidence ledger, learner projections, review policy, transfer policy, language capabilities, and roast gates. Commit `4788f5f`.
> - Phase 2: **complete** — deterministic tutor personas and consent-aware roast composition committed as `45b6ac4`.
> - Phase 3: **complete** — durable Node 24 SQLite repository, validated API routes, webhook/tool auth, idempotency, and persistence tests committed as `61bce4d`.
> - Phase 4: **runtime integration complete; live credential smoke test pending** — provider-neutral voice service, signed URL route, phrase replay route, ElevenLabs React client path, safe fallback, and offline tests are committed as `28b21e5`.
> - Phase 5: **complete** — responsive language-studio foundation committed as `dcc26e9`; the application now starts in onboarding when no saved learner exists.
> - Phase 6: **complete for the offline/live-ready studio path** — API-first adult Hindi→English onboarding, learner hydration, conversation studio, live voice reconnect states, and text fallback are committed as `28b21e5`.
> - Phase 7: **complete for honest offline transcript practice** — phrase seeding, `offline_transcript` assessment route, evidence persistence, phrase replay controls, and no-score uncertainty handling are committed as `28b21e5`. Microphone-based specialized assessment remains pending.
> - Phase 8: **complete** — deterministic review queue refresh, mistake-map projection, and transfer result flow are committed as `28b21e5`.
> - Phases 9–10: **queued** — performance/reliability hardening and final Docker/demo validation.
> - GitHub publication: **complete through `24eed53`** — public repository `https://github.com/Moobiai101/LingoFlow`; commit `28b21e5` is ready to push.
> - Node 24 production smoke: **verified offline** — built `scripts/start.mjs` served `GET /api/health` successfully with Node `24.21.0` and an in-memory database.
> - Docker verification: **pending in this worker** — the shell currently reports `docker: command not found`; retry before final submission.
>
> Living progress notes are maintained at the relevant phase sections below. Every completed working step must pass the offline test command and receive a Git commit.



&#x20;This is the implementation plan the main coding agent should follow.



The plan incorporates



\- Tenmin’s short, conversational learning loop

\- Architecture C realtime conversation plus specialized learning services

\- ElevenLabs

&#x20; - Live conversation `eleven\_flash\_v2\_5`

&#x20; - Phrase replay `eleven\_v4`

\- Adult-only demo

\- Opt-in playful roast mode

\- OmniRush Buildathon reproducibility requirements

\- Delegated implementation through focused subagents

\- A minimalist, professional, non-“AI slop” interface



\---



\# 1. Locked product decisions



\## Hero experience



```text

Hindi-speaking adult learner

&#x20; → learns English

&#x20; → practices a real-world situation

&#x20; → speaks with the tutor

&#x20; → receives a contextual correction

&#x20; → repeats the phrase

&#x20; → gets a phrase card

&#x20; → revisits it later

&#x20; → proves transfer in a new situation

```



\## Voice stack



```text

ElevenLabs Agents

&#x20; └── live conversation with eleven\_flash\_v2\_5



ElevenLabs TTS API

&#x20; └── phrase replay with eleven\_v4



Separate pronunciation adapter

&#x20; └── explicit phrase assessment

```



ElevenLabs should power the live voice experience, but LingoFlow must own



\- Learner memory

\- Error persistence

\- Review scheduling

\- Objective progression

\- Evidence

\- Roast-mode permissions

\- Assessment confidence



\## Product personality



The tutor should feel



\- Warm

\- Funny

\- Slightly mischievous

\- Fast

\- Human

\- Pedagogically disciplined



It should not feel



\- Like a generic chatbot

\- Like a cartoon mascot

\- Like a corporate dashboard

\- Like a fake “AI magic” product

\- Like an abusive or uncontrolled agent



\---



\# 2. The core architectural idea



The unique technical concept should be an Evidence Ledger + Learning Projection system.



\## Evidence Ledger



Every meaningful learner event becomes an append-only evidence record



```text

learner attempted phrase

learner recalled phrase

learner needed a hint

learner repeated phrase successfully

pronunciation assessment returned evidence

learner transferred skill to a new context

```



The LLM may suggest an observation, but it cannot directly change mastery.



\## Learning Projection



A deterministic projection turns evidence into



\- Current objective

\- Mistake map

\- Review queue

\- Persistent weaknesses

\- Transfer readiness

\- Session summary



```text

Raw evidence

&#x20;  ↓

Deterministic policy engine

&#x20;  ↓

Learner projections

&#x20;  ├── current focus

&#x20;  ├── review queue

&#x20;  ├── error map

&#x20;  └── progress report

```



This is more reliable than storing a vague LLM-generated “user memory.”



\---



\# 3. Target module structure



Use a modular monolith first.



```text

apps

&#x20; web

&#x20;   routes

&#x20;   components

&#x20;   voice

&#x20;   design-system

&#x20;   state



&#x20; server

&#x20;   http

&#x20;   webhooks

&#x20;   voice

&#x20;   assessment

&#x20;   persistence

&#x20;   observability



packages

&#x20; domain

&#x20;   learner

&#x20;   evidence

&#x20;   review

&#x20;   objectives

&#x20;   tutor-policy

&#x20;   language-capabilities

&#x20;   roast-policy



&#x20; providers

&#x20;   elevenlabs-agent

&#x20;   elevenlabs-tts

&#x20;   pronunciation

&#x20;   fake-voice

&#x20;   fake-assessment



&#x20; contracts

&#x20;   api

&#x20;   provider-events

&#x20;   database



&#x20; fixtures

&#x20;   sessions

&#x20;   assessments

&#x20;   conversations

```



\## Important boundary



Provider-specific code must not leak into the domain.



The domain should never know about



\- ElevenLabs event names

\- ElevenLabs voice IDs

\- ElevenLabs SDK objects

\- Provider-specific response formats



Use adapters



```text

ElevenLabs event

&#x20;  → ElevenLabs adapter

&#x20;  → internal VoiceEvent

&#x20;  → domain evidence policy

```



\---



\# 4. Delegation protocol



The main agent should delegate implementation, but preserve architectural ownership.



\## Before launching three or more implementation subagents



The main agent must



1\. Load the `omnirush-swarm` skill.

2\. Create the shared swarm board.

3\. Define file ownership.

4\. Create a short architecture decision record.

5\. Assign independent work only after shared contracts are agreed.



\## Recommended implementation subagents



\### Subagent A — Foundation and reproducibility



Owns



```text

package.json

package-lock.json

.nvmrc

Dockerfile

.env.example

README.md

scripts

```



Responsibilities



\- Runtime pinning

\- Docker build and run

\- Offline test command

\- Environment loading

\- CI-like verification scripts

\- No provider secrets

\- Exact setupruntestdeploy documentation



\### Subagent B — Learning kernel



Owns



```text

packagesdomain

packagescontracts

```



Responsibilities



\- Learner model

\- Evidence ledger

\- Review scheduler

\- Mistake persistence rules

\- Objective progression

\- Transfer-task policy

\- Roast-mode policy

\- Pure offline tests



\### Subagent C — Voice and provider integration



Owns



```text

appsservervoice

appsserverwebhooks

packagesproviders

appswebsrcvoice

```



Responsibilities



\- ElevenLabs Agent integration

\- Session-context generation

\- Dynamic variables

\- Webhook tools

\- Conversation event normalization

\- Phrase replay through Eleven v4

\- Fake provider implementation

\- Provider failure handling



\### Subagent D — Product UI and design system



Owns



```text

appswebcomponents

appswebroutes

appswebdesign-system

```



Responsibilities



\- Minimal visual system

\- Onboarding

\- Conversation studio

\- Phrase card

\- Pronunciation drill

\- Review queue

\- Error states

\- Responsive and accessible layout



\## Main agent responsibilities



The main agent must own



\- Architecture decisions

\- Cross-module interfaces

\- Integration

\- Security review

\- Final acceptance flow

\- README accuracy

\- Final Docker verification

\- Final demo rehearsal



\## Delegation rules



Every subagent must



1\. Inspect existing files before editing.

2\. Stay within its assigned ownership boundary.

3\. Add meaningful tests for its behavior.

4\. Run the project test command after each working change.

5\. Report changed files, checks, and unresolved issues.

6\. Never add secrets or machine-specific paths.

7\. Never silently replace an existing decision.

8\. Commit after each working step as required by the Buildathon rules.



If two agents need the same file, the main agent must own the integration change rather than allowing both agents to edit it.



\---



\# 5. Phase-by-phase execution plan



\## Phase 0 — Repository and reproducibility contract

> **Status: complete.** Foundation committed as `08e9eef`; local npm checks passed. Docker verification is being rerun now that Docker is available.



\### Goal



Create a clean, rebuildable project foundation before product implementation.



\### Deliverables



\- Git repository

\- `.nvmrc` pinned to Node `24.21.0`

\- `package.json`

\- `package-lock.json`

\- Dockerfile

\- `.env.example`

\- README

\- Canonical offline test command



```bash

npm test

```



\### Required README sections



```text

Project overview

Architecture

Environment variables

Local setup

Docker setup

Development run command

Test command

Build command

Deployment steps

Provider configuration

Offline demo mode

Privacy and data retention

```



\### Acceptance tests



\- A clean Docker build succeeds.

\- The container starts without absolute paths.

\- `npm test` works without live API keys.

\- Missing environment variables produce a clear message.

\- `.env` is ignored.

\- No secrets appear in Git.

\- README commands match the actual project.



\### Commit



```text

chore establish reproducible project foundation

```



\---



\## Phase 1 — Domain contracts and learner model

> **Status: complete.** Contracts, evidence ledger, projections, review/transfer policies, language capabilities, and offline tests committed as `4788f5f`.



\### Goal



Build the learning engine before connecting voice.



\### Core entities



```text

LearnerProfile

LearningObjective

LearningItem

Session

Utterance

EvidenceEvent

SkillState

ReviewItem

PronunciationAssessment

ConsentPolicy

```



\### Evidence event shape



```text

id

learnerId

sessionId

itemId

type

expected

observed

outcome

confidence

source

context

createdAt

```



\### Evidence types



```text

understood

attempted

corrected

recalled

pronunciation\_assessed

hint\_required

retry\_success

transfer\_success

transfer\_failure

```



\### Persistence rules



A mistake becomes persistent only when evidence supports it.



Initial rule



```text

One low-confidence miss

&#x20; temporary



Two high-confidence errors across separate turns

&#x20; suspected weakness



Three high-confidence errors across sessions

&#x20; persistent weakness



Successful transfer in a new situation

&#x20; reduce priority

```



\### Review scheduling



Use deterministic intervals



```text

first success same day

second success next day

third success three days

fourth success seven days

fifth success fourteen days

```



Shorten intervals after



\- Failed transfer

\- Repeated high-confidence error

\- Long inactivity period



\### Acceptance tests



\- Duplicate evidence cannot be applied twice.

\- One uncertain mistake does not create a permanent weakness.

\- Repeated mistakes enter the review queue.

\- Successful transfer reduces review priority.

\- Unsupported language capabilities are rejected.

\- The scheduler is deterministic.

\- The complete domain runs without network access.



\### Commit



```text

feat add evidence-ledger learning kernel

```



\---



\## Phase 2 — Tutor policy and roast policy

> **Status: complete.** Core policy gates in `packages/domain/src/roast.ts` and deterministic persona behavior in `packages/domain/src/tutor-policy.ts` are committed as `45b6ac4`; live tutor integration and end-to-end policy checks remain in later phases.



\### Goal



Make personality affect teaching behavior, not just wording.



\### Tutor policies



```text

Patient mentor

&#x20; hints first, slower escalation, native-language explanation



Funny friend

&#x20; delayed correction, playful example, preserves momentum



Strict coach

&#x20; immediate correction, focused retry, fewer hints



Professional coach

&#x20; concise feedback, objective-driven, low narration

```



\### Roast-mode contract



Roast mode must be



\- Adult-only

\- Explicitly opt-in

\- Disableable immediately

\- Targeted at the attempt, never the person

\- Limited to one brief joke per correction

\- Followed by useful teaching



Never permit



\- Slurs

\- Identity-based attacks

\- Threats

\- Sexual humiliation

\- Hate language

\- Attacks on intelligence, appearance, caste, religion, gender, disability, nationality, or race



\### Server-side gate



```text

roastAllowed =

&#x20; adultUser

&#x20; AND explicitOptIn

&#x20; AND sessionMode != off

&#x20; AND noSafetyRestriction

```



\### Acceptance tests



\- Roast mode is off by default.

\- Non-adult profiles cannot enable it.

\- Saying “stop roasting me” disables it immediately.

\- A roast never replaces the correction.

\- One turn cannot generate multiple roast lines.

\- Unsafe categories are rejected before voice synthesis.

\- Clean mode never receives roast text.



\### Commit



```text

feat add tutor personality and consent-aware roast policy

```



\---



\## Phase 3 — Backend and persistence

> **Status: complete.** Durable SQLite persistence, transactional/idempotent evidence writes, learner/objective/session/phrase/review APIs, normalized provider webhook handling, request metrics, and backend tests are committed as `61bce4d`. Docker could not be run in the worker shell because the `docker` command is unavailable there; this remains an explicit validation gap.



\### Goal



Expose stable application APIs around the learning kernel.



\### Initial endpoints



```text

GET  apihealth

POST apilearners

GET  apilearnersidsummary

GET  apilearnersidreview-queue

GET  apilearnersidobjectives

POST apisessions

POST apievidence

POST apitransfer-attempts

GET  apiphrasesid

POST apivoicesession-context

POST apiwebhookselevenlabs

```



\### Persistence approach



Use SQLite for the buildathon.



Keep



\- Schema migrations

\- Seed fixtures

\- Transactional writes

\- Indexes on learner and review queries

\- Timestamps in UTC

\- No raw audio by default



\### Acceptance tests



\- App restarts without losing learner state.

\- Evidence writes are transactional.

\- Invalid evidence is rejected.

\- Learner summaries derive from evidence.

\- Review queue ordering is deterministic.

\- Webhook requests require authentication.

\- No raw provider payload is written blindly to the database.



\### Commit



```text

feat add learner APIs and durable SQLite persistence

```



\---



\## Phase 4 — ElevenLabs live voice integration

> **Status: runtime integration complete; live credential smoke test pending.** Provider-neutral ports, the server-owned voice session service, signed URL connection route, `eleven_v4` replay route, ElevenLabs React client path, normalized events, webhook validation, safe text fallback, and offline fakes are committed in `28b21e5`. The adapter foundation is committed as `74663b8`.



\### Goal



Connect the first working voice conversation.



\### ElevenLabs responsibilities



\- Realtime audio

\- Speech recognition

\- Turn-taking

\- Tutor voice

\- Interruptions

\- Conversation events



\### LingoFlow responsibilities



Before starting a session, build a compact context



```text

target language

native language

level

current objective

active phrase

top two error patterns

review item

tutor personality

roast mode state

```



Pass this through ElevenLabs dynamic variables or approved conversation overrides.



\### Tools exposed to the agent



```text

get\_current\_objective

get\_phrase\_details

record\_learning\_evidence

request\_phrase\_practice

mark\_transfer\_result

```



The agent may call these tools, but the backend validates every request.



\### Phrase replay



Use ElevenLabs `eleven\_v4` for



\- Model phrase playback

\- Corrected sentence playback

\- Phrase-card audio

\- Slow replay variants if supported



Cache generated phrase audio by



```text

phraseId

voiceId

modelId

language

speed

contentVersion

```



\### Acceptance tests



\- Live provider credentials remain server-side.

\- Fake provider mode works offline.

\- Conversation events normalize into internal events.

\- Provider disconnect moves the UI to a recoverable state.

\- Agent tool calls cannot write arbitrary learner state.

\- Phrase replay is cached.

\- ElevenLabs failures do not corrupt the learning ledger.

\- Text fallback can use the same tutor policy.



\### Commit



```text

feat integrate ElevenLabs realtime tutor and phrase replay

```



\---



\## Phase 5 — Product UI foundation

> **Status: complete.** The responsive language-studio shell, design primitives, connection states, onboarding shell, and fixture-driven studio are committed as `dcc26e9`. The current product-flow work builds on this foundation.



\### Goal



Create the premium visual system before adding many screens.



\## Visual direction



Use a quiet “language studio” aesthetic



\- Warm off-white or charcoal background

\- Ink-colored text

\- One restrained accent color

\- Strong typography

\- Large whitespace

\- Thin borders

\- Subtle shadows

\- No neon gradients

\- No excessive rounded cards

\- No stock AI illustrations

\- No animated robot face

\- No dashboard-grid overload



The app should feel closer to



```text

editorial learning studio

\+

premium audio application

\+

language notebook

```



\### Signature interaction



The main conversation screen should have three persistent regions



```text

Conversation lane

&#x20; Live tutor transcript and learner turns



Signal rail

&#x20; One current objective

&#x20; One active correction

&#x20; One review cue



Action dock

&#x20; Speak

&#x20; Interrupt

&#x20; Practice phrase

&#x20; Slow down

&#x20; Show translation

```



This is more distinctive than a generic chatbot chat panel.



\### Motion



Use motion only for



\- Listening state

\- Speaking state

\- Connection transitions

\- Phrase replay

\- Review completion



Avoid



\- Constant floating cards

\- Decorative particle backgrounds

\- Aggressive waveform animations

\- Motion that distracts from speech



\### Acceptance tests



\- Keyboard navigation works.

\- Focus states are visible.

\- Reduced-motion mode works.

\- Layout works on laptop and mobile widths.

\- Initial route loads without requiring voice credentials.

\- No screen depends on hidden hover behavior.

\- Loading and failure states are designed, not browser defaults.



\### Commit



```text

feat establish LingoFlow studio design system

```



\---



\## Phase 6 — Onboarding and conversation studio

> **Status: implemented in `28b21e5`; browser permission/live provider smoke test pending.** Adult Hindi→English onboarding persists learner/session state with local fallback, and the studio now calls the server voice route, uses the ElevenLabs React client for signed live sessions, and exposes recoverable text/offline states.



\### Onboarding flow



Keep it short



1\. Native language

2\. Target language

3\. Goal

4\. Approximate level

5\. Tutor personality

6\. Roast-mode consent

7\. Microphone test

8\. First phrase



End onboarding with a useful spoken interaction, not a long questionnaire.



\### Conversation studio states



Explicitly model



```text

idle

requesting\_microphone

connecting

listening

learner\_speaking

tutor\_thinking

tutor\_speaking

interrupted

reconnecting

text\_fallback

session\_complete

```



\### Acceptance tests



\- Permission denial has a clear recovery path.

\- The learner can interrupt tutor playback.

\- Text fallback preserves the current objective.

\- Connection state is always visible.

\- Live captions can be toggled.

\- The learner can ask for translation or explanation.

\- The learner can select “Practice this phrase.”

\- A ten-minute session can finish with a useful summary.



\### Commit



```text

feat add onboarding and live conversation studio

```



\---



\## Phase 7 — Phrase cards and pronunciation practice

> **Status: offline transcript slice implemented in `28b21e5`; microphone assessment pending.** Starter phrases are seeded, practice calls `POST /api/practice/assess`, normalized evidence updates projections, model replay calls the provider route, and uncertain/failed transcript attempts do not receive invented scores. The current drill intentionally does not claim phoneme-level microphone scoring.



\### Goal



Reproduce Tenmin’s strongest learning interaction and make it more trustworthy.



\### Phrase card



Display



```text

Target phrase

Natural translation

Literal meaning when useful

Transliteration where appropriate

Model audio

Record button

Practice button

```



\### Explicit drill flow



```text

Conversation identifies phrase

&#x20;  ↓

Learner taps Practice

&#x20;  ↓

Phrase card opens

&#x20;  ↓

Model plays phrase

&#x20;  ↓

Learner records short attempt

&#x20;  ↓

Assessment runs asynchronously

&#x20;  ↓

Evidence is normalized

&#x20;  ↓

Feedback is shown with confidence

&#x20;  ↓

Learner retries

```



\### Feedback rules



Show



\- What was clear

\- What needs another attempt

\- Why the result is uncertain

\- Assessment confidence

\- One actionable next step



Never show unsupported precision.



\### Acceptance tests



\- Low-confidence results do not produce fake scores.

\- Unsupported locales show a clear limitation.

\- Assessment results persist as evidence.

\- Retry updates the learner state.

\- Audio upload limits are enforced.

\- Raw audio retention follows policy.

\- Assessment failure does not block conversation.



\### Commit



```text

feat add phrase cards and evidence-based pronunciation drills

```



\---



\## Phase 8 — Review queue, mistake map, and transfer

> **Status: implemented in `28b21e5`; final demo validation pending.** Practice and transfer evidence refresh the deterministic review queue and mistake-map projections, while the studio exposes explainable review items and a new-situation transfer task.



\### Review queue



Every review item must explain why it appeared



```text

Due for review

Repeated pronunciation difficulty

You needed a hint twice

Transfer not yet demonstrated

```



\### Mistake map



Group by evidence



```text

Needs attention

&#x20; Question forms — 3 high-confidence misses

&#x20; Word-final sounds — 2 recurring errors



Improving

&#x20; Restaurant requests — successful in two contexts



Stable

&#x20; Introductions — transferred successfully

```



\### Transfer tasks



After a learner succeeds with a phrase, change



\- Situation

\- Vocabulary

\- Sentence surface

\- Conversational intent



Example



```text

Practice

“Could I have a glass of water, please”



Transfer

Ask a hotel receptionist for water after checking in.

```



\### Acceptance tests



\- Exact repetition is not counted as transfer.

\- Transfer failure requeues the skill.

\- Transfer success lowers priority.

\- The review queue explains itself.

\- The progress view uses evidence, not invented fluency scores.



\### Commit



```text

feat add review queue, mistake map, and transfer practice

```



\---



\## Phase 9 — Performance and reliability hardening



\### Performance budgets



Set budgets before measuring



```text

Initial JavaScript keep the core route small

Largest Contentful Paint target under 2.5 seconds on a mid-range device

Interaction response target under 100 ms for local UI actions

Animation maintain 60 fps

Phrase replay cache repeat requests

```



Do not claim measured performance until the benchmark is actually run.



\### Voice metrics



Instrument



```text

session\_connect\_start

session\_connected

learner\_speech\_start

learner\_turn\_end

first\_audio\_received

first\_audio\_played

interrupt\_received

playback\_cancelled

assessment\_started

assessment\_completed

fallback\_entered

```



\### Reliability behavior



\- Retry transient provider failures.

\- Do not retry malformed provider data indefinitely.

\- Use circuit breaking for repeated provider failures.

\- Show pending assessment state.

\- Preserve learning evidence during reconnects.

\- Use request IDs for idempotency.

\- Keep provider logs free of raw audio and secrets.



\### Acceptance tests



\- Provider timeout enters fallback.

\- Duplicate webhook delivery is safe.

\- Reconnect does not duplicate evidence.

\- Session cancellation cleans up audio resources.

\- Long sessions do not grow context without bound.

\- Rate limits produce a friendly state.



\### Commit



```text

perf harden latency, recovery, and provider failure paths

```



\---



\## Phase 10 — Buildathon validation and demo hardening



\### Required checks



Run all of these before submission



```bash

npm test

npm run typecheck

npm run lint

npm run build

docker build .

docker run ...

```



`npm test` must work offline using fake providers.



\### Demo mode



Provide a clearly documented fixture mode that can demonstrate



\- Conversation

\- Correction

\- Phrase practice

\- Assessment result

\- Review queue

\- Transfer task



The fixture mode must not pretend that simulated results are live assessments. Label it clearly.



\### Final demo sequence



```text

1\. Adult learner selects Hindi → English.

2\. Learner chooses Patient Mentor.

3\. Learner opts into Friendly Roast Mode.

4\. Tutor starts a café scenario.

5\. Learner speaks naturally.

6\. Tutor corrects one meaningful error.

7\. Tutor makes one playful joke about the attempt.

8\. Learner taps Practice this.

9\. Phrase card plays through eleven\_v4.

10\. Learner records the phrase.

11\. Assessment returns evidence and confidence.

12\. Learner retries.

13\. Tutor tests the same skill in a new situation.

14\. Mistake map and review queue update.

```



The demo should take approximately five to seven minutes.



\---



\# 6. Final acceptance criteria



The project is ready when all of these are true



\## Product



\- A learner can complete one full learning loop.

\- The tutor adapts to learner state.

\- Mistakes become evidence.

\- Evidence affects future practice.

\- The learner performs transfer.

\- Phrase replay works with ElevenLabs `eleven\_v4`.

\- Live conversation works with ElevenLabs `eleven\_flash\_v2\_5`.

\- Text fallback works.



\## Learning integrity



\- No unsupported pronunciation scores.

\- Low-confidence assessments are labeled honestly.

\- Mastery is not generated by a free-form LLM summary.

\- Review decisions are explainable.

\- One mistake does not permanently label the learner.



\## Roast mode



\- Adult-only.

\- Explicitly opt-in.

\- Off by default.

\- Can be disabled immediately.

\- Teases attempts, not identities.

\- One brief joke maximum per correction.

\- Always followed by a useful correction.



\## Engineering



\- Pinned Node runtime.

\- Lockfile committed.

\- Dockerfile works on a clean Linux machine.

\- Offline test command works.

\- No embedded secrets.

\- No absolute machine paths.

\- README contains exact setup, run, test, and deploy steps.

\- Every working implementation step has a Git commit.

\- Every change has a test run recorded.



\## Design



\- Minimal and professional.

\- Responsive.

\- Accessible.

\- No generic AI dashboard appearance.

\- No decorative complexity that competes with the learning task.

\- Core interaction is recognizable within five seconds.



\---



\# Highest-leverage next action



Begin with Phase 0 and Phase 1 together, then run a narrow ElevenLabs spike before building the full UI



```text

Create learner

&#x20; → create objective

&#x20; → start fake session

&#x20; → record evidence

&#x20; → generate review item

&#x20; → start ElevenLabs live session

&#x20; → call one LingoFlow tool

&#x20; → replay one phrase with eleven\_v4

```



If that vertical slice works, the remaining work can be developed safely in parallel by the foundation, learning-kernel, voice, and UI subagents.

