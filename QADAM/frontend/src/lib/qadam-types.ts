/** Типы ответов API (MVP, совпадают с Pydantic-схемами бэкенда). */

export type UserPublic = {
  id: string;
  email: string;
  full_name: string | null;
  timezone: string | null;
  is_active: boolean;
  is_superuser: boolean;
  reminder_quiet_enabled: boolean;
  reminder_quiet_start_hour_local: number | null;
  reminder_quiet_end_hour_local: number | null;
  created_at: string;
};

export type NotificationPublic = {
  id: string;
  task_id: string | null;
  channel: string;
  status: string;
  error_detail: string | null;
  payload: Record<string, unknown> | null;
  sent_at: string;
};

export type TelegramStatusPublic = {
  connected: boolean;
  verified: boolean;
  telegram_user_id: number | null;
  chat_id: number | null;
  sound_enabled: boolean;
};

export type TelegramTestMessagePublic = {
  ok: boolean;
  detail: string;
};

export type TelegramPrefsPublic = {
  sound_enabled: boolean;
};

export type AdminUserProgressPublic = {
  user_id: string;
  email: string;
  goals_total: number;
  goals_active: number;
  tasks_total: number;
  tasks_by_status: Record<string, number>;
  active_roadmaps: number;
  tests_attempts_last_7_days: number;
  homework_submissions_last_7_days: number;
  tasks_completed_last_7_days: number;
};

export type AdminUserRow = {
  id: string;
  email: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
};

/** Ответ PATCH /api/v1/admin/roadmaps/{id} */
export type RoadmapStatusPublic = {
  id: string;
  status: string;
};

export type AdminRoadmapRow = {
  id: string;
  goal_id: string;
  user_id: string;
  user_email: string;
  goal_title: string;
  version: number;
  status: string;
  created_at: string;
};

export type AdminAuditLogPublic = {
  id: string;
  actor_user_id: string;
  actor_email: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type ProgressLogItemPublic = {
  id: string;
  event_type: string;
  goal_id: string | null;
  task_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
};

export type GoalPublic = {
  id: string;
  user_id: string;
  domain: string;
  title: string;
  target_date: string | null;
  priority: number;
  status: string;
  created_at: string;
};

export type AssessmentPublic = {
  id: string;
  user_id: string;
  goal_id: string;
  answers: Record<string, unknown>;
  ai_summary: string | null;
  created_at: string;
};

export type TaskPublic = {
  id: string;
  roadmap_step_id: string;
  title: string;
  task_type: string;
  due_at: string | null;
  status: string;
  completed_at?: string | null;
  last_nudge_at?: string | null;
  created_at: string;
};

export type RoadmapStepPublic = {
  id: string;
  sequence_no: number;
  title: string;
  description: string | null;
  estimated_days: number | null;
  tasks: TaskPublic[];
};

export type LearningResourcePublic = {
  id: string;
  task_id: string;
  source: string;
  url: string;
  title: string;
  language: string | null;
  duration_min: number | null;
  created_at: string;
};

export type RoadmapPublic = {
  id: string;
  goal_id: string;
  user_id: string;
  version: number;
  status: string;
  created_at: string;
  steps: RoadmapStepPublic[];
};

/** Публичный тест (без правильных ответов). */
export type QuizQuestionPublic = {
  id: string;
  type?: string;
  prompt?: string;
  options?: string[];
};

export type TestViewPublic = {
  id: string;
  task_id: string;
  test_type: string;
  created_at: string;
  content: {
    passing_score: number;
    questions: QuizQuestionPublic[];
  };
};

export type AttemptResultPublic = {
  id: string;
  test_id: string;
  score: number;
  passed: boolean;
  passing_score: number;
  created_at: string;
  details?: Array<{
    question_id: string;
    type: string;
    is_correct: boolean;
    user_answer: unknown;
    correct_answer: unknown;
  }>;
};

export type HomeworkViewPublic = {
  id: string;
  task_id: string;
  text_answer: string | null;
  original_filename: string | null;
  ai_feedback: string | null;
  grade: number | null;
  created_at: string;
  download_path: string | null;
};

export type ProgressOverviewPublic = {
  generated_at: string;
  goals_total: number;
  goals_active: number;
  tasks_total: number;
  tasks_by_status: Record<string, number>;
  overdue_open_tasks: number;
  /** Подряд UTC-дней с ≥1 завершённой задачей (по completed_at). */
  task_completion_streak_days: number;
  tests_attempts_last_7_days: number;
  homework_submissions_last_7_days: number;
  tasks_completed_last_7_days: number;
};

export type DayActivityPublic = {
  date: string;
  test_attempts: number;
  homework_submissions: number;
  tasks_completed: number;
};

export type WeeklyReportPublic = {
  period_start: string;
  period_end: string;
  days: DayActivityPublic[];
  totals: Record<string, number>;
};

export type MonthlyReportPublic = {
  period_start: string;
  period_end: string;
  days: DayActivityPublic[];
  totals: Record<string, number>;
};

export type ProgressRecommendationsPublic = {
  generated_at: string;
  next_milestone: number;
  streak_to_go: number;
  tips: string[];
};

export type HabitPublic = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  completed_today: boolean;
  current_streak_days: number;
};

export type HabitCheckPublic = {
  habit_id: string;
  log_date: string;
  completed: boolean;
};

export type LeaderboardRowPublic = {
  rank: number;
  user_id: string;
  score: number;
  tasks_completed: number;
  habits_completed: number;
  tests_attempted: number;
  homework_submissions: number;
};

export type LeaderboardPublic = {
  period: string;
  period_start: string;
  period_end: string;
  rows: LeaderboardRowPublic[];
};

export type ProgressChartsPublic = {
  generated_at: string;
  period_start: string;
  period_end: string;
  completion_series: Array<{ date: string; value: number }>;
  habits_series: Array<{ date: string; value: number }>;
};

export type PredictiveInsightPublic = {
  generated_at: string;
  completion_velocity_per_day: number;
  overdue_risk_score: number;
  streak_trend: string;
  next_7_days_focus: string[];
  explanation: string;
};

export const GOAL_DOMAINS: { value: string; label: string }[] = [
  { value: "learning", label: "Обучение" },
  { value: "programming", label: "Программирование" },
  { value: "sport", label: "Спорт / здоровье" },
  { value: "english", label: "Английский" },
  { value: "career", label: "Карьера" },
  { value: "business", label: "Бизнес" },
  { value: "self_development", label: "Саморазвитие" },
  { value: "other", label: "Другое" },
];
