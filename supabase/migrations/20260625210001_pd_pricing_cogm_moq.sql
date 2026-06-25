-- Rename COGM line key and add MOQ field per pricing line

alter table public.pd_pricing_lines
  add column if not exists moq text;

-- Merge legacy cogm_moq_5k rows into cogm when both exist for a project
update public.pd_pricing_lines cogm
set
  amount = coalesce(cogm.amount, legacy.amount),
  moq = coalesce(cogm.moq, legacy.moq),
  supplier_id = coalesce(cogm.supplier_id, legacy.supplier_id),
  offer_note = coalesce(cogm.offer_note, legacy.offer_note)
from public.pd_pricing_lines legacy
where legacy.line_key = 'cogm_moq_5k'
  and cogm.line_key = 'cogm'
  and cogm.project_id = legacy.project_id;

-- Re-link files from legacy line to cogm line before deleting duplicate
update public.pd_files files
set pricing_line_id = cogm.id
from public.pd_pricing_lines legacy
join public.pd_pricing_lines cogm
  on cogm.project_id = legacy.project_id
  and cogm.line_key = 'cogm'
where legacy.line_key = 'cogm_moq_5k'
  and files.pricing_line_id = legacy.id;

delete from public.pd_pricing_lines legacy
using public.pd_pricing_lines cogm
where legacy.line_key = 'cogm_moq_5k'
  and cogm.line_key = 'cogm'
  and cogm.project_id = legacy.project_id;

update public.pd_pricing_lines
set line_key = 'cogm'
where line_key = 'cogm_moq_5k';
