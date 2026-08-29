-- Assign admin and moderator roles to makemyvash@gmail.com
DO $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Find user by email
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'makemyvash@gmail.com';
  
  IF v_user_id IS NOT NULL THEN
    -- Ensure email is confirmed for direct sign in
    UPDATE auth.users
    SET email_confirmed_at = COALESCE(email_confirmed_at, now())
    WHERE id = v_user_id;

    -- Assign admin role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;

    -- Assign moderator role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (v_user_id, 'moderator')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END $$;
