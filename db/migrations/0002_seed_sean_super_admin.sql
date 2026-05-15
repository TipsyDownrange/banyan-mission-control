-- UP
INSERT INTO public.users (email, name, role, island, active)
VALUES (
  'sean@kulaglass.com',
  'Sean Daniels',
  'super_admin',
  'maui',
  true
)
ON CONFLICT (email) DO NOTHING;

-- DOWN
-- DELETE FROM public.users WHERE email = 'sean@kulaglass.com';
