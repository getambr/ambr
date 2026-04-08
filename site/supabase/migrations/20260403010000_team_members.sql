-- Team members for shared dashboard access
CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  ambr_alias text,
  api_key_id uuid REFERENCES public.api_keys(id),
  notifications_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  invited_by text,
  UNIQUE(email)
);

CREATE INDEX IF NOT EXISTS idx_team_email ON public.team_members(email);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

INSERT INTO public.team_members (email, name, role, ambr_alias) VALUES
  ('ilvers.sermols@gmail.com', 'Ilvers', 'owner', 'ilvers@ambr.run'),
  ('dainis@ambr.run', 'Dainis', 'admin', 'dainis@ambr.run')
ON CONFLICT (email) DO NOTHING;
