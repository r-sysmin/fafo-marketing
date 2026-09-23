CREATE TABLE public.campaign_audiences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  org_id uuid NOT NULL,
  created_by uuid NOT NULL,
  name text NOT NULL,
  description text,
  match_type text NOT NULL DEFAULT 'all' CHECK (match_type IN ('all','any')),
  rules jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_size integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaign_audiences_ws_idx ON public.campaign_audiences(workspace_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_audiences TO authenticated;
GRANT ALL ON public.campaign_audiences TO service_role;
ALTER TABLE public.campaign_audiences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Org members view audiences" ON public.campaign_audiences FOR SELECT TO authenticated USING (public.is_org_member(org_id));
CREATE POLICY "Org members add audiences" ON public.campaign_audiences FOR INSERT TO authenticated WITH CHECK (public.is_org_member(org_id) AND created_by = auth.uid());
CREATE POLICY "Org members edit audiences" ON public.campaign_audiences FOR UPDATE TO authenticated USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "Org members delete audiences" ON public.campaign_audiences FOR DELETE TO authenticated USING (public.is_org_member(org_id));
CREATE OR REPLACE FUNCTION public.tg_campaign_audiences_updated_at() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER campaign_audiences_updated_at BEFORE UPDATE ON public.campaign_audiences FOR EACH ROW EXECUTE FUNCTION public.tg_campaign_audiences_updated_at();