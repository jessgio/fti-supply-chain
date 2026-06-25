alter table public.pd_formula_tracker_entries
  add column benchmark_changed_from_previous_feedback text,
  add column benchmark_change_from_previous_explanation text;
