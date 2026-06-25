-- Cross-department integration: link purchase_orders to pd_projects
-- This enables the PD team to see which POs have been placed for their launches,
-- and allows supply chain to tag a PO to a specific product development project.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS pd_project_id UUID REFERENCES pd_projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_orders_pd_project_id
  ON purchase_orders(pd_project_id)
  WHERE pd_project_id IS NOT NULL;

COMMENT ON COLUMN purchase_orders.pd_project_id IS
  'Optional reference to the PD project this PO was placed for. '
  'Links supply chain procurement to product development launches.';
