# Qadam - Product & Technical Specification (MVP v1)

## 1) Product Vision

Qadam is an AI mentor platform that helps users achieve goals in learning, career, sport, language, and self-development.  
The system analyzes current user state, builds a personalized roadmap, assigns daily tasks, monitors progress, and maintains discipline through Telegram reminders.

## 2) MVP Scope

### In Scope (v1)
- Registration and login (JWT)
- Goal creation (single or multiple goals)
- Initial AI assessment questionnaire
- AI roadmap generation (milestones + daily tasks)
- Calendar planning for tasks/deadlines
- Learning content recommendation (YouTube links)
- Topic tests and homework submission
- Task completion tracking + progress analytics
- Telegram bot reminders for pending tasks
- Admin panel (basic user/progress control)

### Out of Scope (v1, can be v2+)
- Full gamification marketplace
- Advanced social ranking
- Deep adaptive AI memory across years
- Enterprise multi-tenant setup

## 3) User Roles

- **User**: creates goals, learns, completes tasks, submits homework.
- **Admin**: manages users, roadmaps, tests, bot settings, analytics.
- **System AI**: generates roadmap, tasks, tests, and feedback.

## 4) Core User Flow

1. User registers and logs in.
2. User connects Telegram account.
3. User selects one or more goal domains and target outcomes.
4. User passes AI assessment (domain-specific diagnostics).
5. AI generates personalized roadmap and schedule.
6. User studies recommended materials and completes tasks/tests/homework.
7. System checks progress and adjusts next tasks.
8. Telegram bot sends reminders until overdue tasks are completed.

## 5) Domain-Specific Assessment Templates

### Learning/Programming
- Current knowledge level
- Known topics
- Practical project experience
- Time available per day/week
- Discipline level
- Target deadline and role

### Sports/Fitness
- Weight, height, age, sex
- Training history
- Nutrition, sleep, habits
- Injuries and limitations
- Goal type: gain/cut/recomposition

### English Language
- CEFR level (A1-C2)
- Vocabulary estimation
- Speaking/listening/writing level
- Goal context (IELTS/TOEFL/interview/general)

### Career/Business
- Current role and years of experience
- Existing hard/soft skills
- Current income and target income/position
- Target timeline

## 6) Functional Modules

1. **Auth Module**
   - Sign up, login, refresh token, profile.
2. **Goal Management Module**
   - Goal CRUD, priorities, target deadlines.
3. **Assessment Module**
   - Dynamic questionnaires by goal domain.
4. **AI Planner Module**
   - Roadmap generation, task sequencing, workload balancing.
5. **Learning Module**
   - YouTube content recommendations, lesson tracking.
6. **Testing & Homework Module**
   - Quiz generation, submission, AI grading.
7. **Calendar Module**
   - Weekly/monthly planning, auto-rescheduling.
8. **Progress Module**
   - Completion metrics, streaks, reports.
9. **Notification Module**
   - Telegram reminders, escalation frequency rules.
10. **Admin Module**
   - User oversight, content/test moderation, analytics.

## 7) Proposed Tech Stack (Recommended)

- **Frontend**: Next.js (React + App Router), TypeScript, Tailwind
- **Backend**: FastAPI, Python 3.12
- **Database**: PostgreSQL
- **Cache/Queue**: Redis + Celery (or RQ)
- **AI Provider**: OpenAI API (pluggable adapter for Gemini/Claude)
- **Telegram**: Telegram Bot API webhook mode
- **Storage**: S3-compatible object storage for homework files
- **Infra**: Docker + docker-compose (MVP), CI/CD via GitHub Actions

## 8) High-Level Architecture

- Frontend calls REST API.
- Backend services:
  - Auth Service
  - Planner Service (AI orchestration)
  - Content Service (YouTube recommendations)
  - Assessment/Test Service
  - Progress Service
  - Notification Service
- Async workers process:
  - Reminder scheduling
  - AI generation tasks
  - Heavy grading/report jobs

## 9) Data Model (Core Entities)

- `users`  
  `id`, `email`, `password_hash`, `full_name`, `timezone`, `created_at`

- `telegram_links`  
  `id`, `user_id`, `telegram_user_id`, `chat_id`, `is_verified`, `created_at`

- `goals`  
  `id`, `user_id`, `domain`, `title`, `target_date`, `priority`, `status`

- `assessments`  
  `id`, `user_id`, `goal_id`, `answers_json`, `ai_summary`, `created_at`

- `roadmaps`  
  `id`, `user_id`, `goal_id`, `version`, `status`, `created_at`

- `roadmap_steps`  
  `id`, `roadmap_id`, `sequence_no`, `title`, `description`, `estimated_days`

- `tasks`  
  `id`, `user_id`, `goal_id`, `roadmap_step_id`, `title`, `type`, `due_at`, `status`

- `learning_resources`  
  `id`, `task_id`, `source`, `url`, `title`, `language`, `duration_min`

- `tests`  
  `id`, `task_id`, `test_type`, `questions_json`, `passing_score`

- `test_attempts`  
  `id`, `test_id`, `user_id`, `answers_json`, `score`, `passed`, `created_at`

- `homework_submissions`  
  `id`, `task_id`, `user_id`, `file_url`, `text_answer`, `ai_feedback`, `grade`

- `progress_logs`  
  `id`, `user_id`, `task_id`, `event_type`, `metadata_json`, `created_at`

- `notifications`  
  `id`, `user_id`, `task_id`, `channel`, `status`, `sent_at`

## 10) API Design (MVP Endpoints)

### Auth
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/refresh`
- `GET /api/v1/me`

### Telegram
- `POST /api/v1/telegram/link/start`
- `POST /api/v1/telegram/link/confirm`
- `POST /api/v1/telegram/webhook`

### Goals & Assessment
- `POST /api/v1/goals`
- `GET /api/v1/goals`
- `POST /api/v1/goals/{goalId}/assessment`
- `POST /api/v1/goals/{goalId}/roadmap/generate`

### Roadmap & Tasks
- `GET /api/v1/roadmaps/{goalId}`
- `GET /api/v1/tasks?date=YYYY-MM-DD`
- `PATCH /api/v1/tasks/{taskId}/status`
- `POST /api/v1/tasks/{taskId}/reschedule`

### Learning/Test/Homework
- `GET /api/v1/tasks/{taskId}/resources`
- `POST /api/v1/tasks/{taskId}/tests/generate`
- `POST /api/v1/tests/{testId}/attempt`
- `POST /api/v1/tasks/{taskId}/homework/submit`

### Progress & Reports
- `GET /api/v1/progress/overview`
- `GET /api/v1/reports/weekly`
- `GET /api/v1/reports/monthly`

### Admin
- `GET /api/v1/admin/users`
- `GET /api/v1/admin/users/{userId}/progress`
- `PATCH /api/v1/admin/roadmaps/{roadmapId}`

## 11) Telegram Reminder Rules (MVP Policy)

- Send first reminder at task start time.
- If task is pending and overdue, resend every 3 minutes.
- Stop reminders immediately after task status changes to `completed`.
- Daily quiet hours are configurable by user timezone.
- Max reminder attempts per task/day configurable by admin.

## 12) AI Orchestration Strategy

- Use structured prompts with JSON output schema.
- Keep provider abstraction:
  - `AIProvider.generateRoadmap()`
  - `AIProvider.generateTest()`
  - `AIProvider.reviewHomework()`
  - `AIProvider.adjustPlan()`
- Validate AI output server-side before saving.
- Log prompt templates and response metadata for observability.

## 13) Security & Compliance

- Password hashing with Argon2 or bcrypt.
- JWT access + refresh token rotation.
- Role-based access control (`user`, `admin`).
- Input validation with strict schemas.
- Rate limits for auth and AI-heavy endpoints.
- Audit logs for admin actions.

## 14) Non-Functional Requirements

- API p95 latency < 400 ms for non-AI endpoints.
- Reminder delivery reliability > 99%.
- Horizontal scaling for worker queues.
- Basic observability:
  - structured logs
  - error tracking
  - health checks

## 15) Delivery Plan (8 Weeks MVP)

- **Week 1**: project bootstrap, auth, DB schema.
- **Week 2**: goals + assessment API.
- **Week 3**: AI roadmap generation + task engine.
- **Week 4**: calendar + progress tracking.
- **Week 5**: YouTube resources + testing module.
- **Week 6**: homework submission + AI feedback.
- **Week 7**: Telegram bot reminders + admin panel basics.
- **Week 8**: QA, stabilization, deployment, monitoring.

## 16) Acceptance Criteria (MVP)

- User can create at least one goal and pass assessment.
- AI roadmap is generated and visible with daily tasks.
- User can mark tasks complete and submit homework.
- System generates and grades at least one test per topic.
- Telegram bot sends reminders and stops after completion.
- Admin can view user progress and adjust roadmap.

## 17) Next Immediate Engineering Step

Create repository structure:
- `frontend/` (Next.js)
- `backend/` (FastAPI)
- `infra/` (docker-compose, env templates)
- `docs/` (API schema, prompts, product docs)

Then implement authentication and goal management as the first vertical slice.
