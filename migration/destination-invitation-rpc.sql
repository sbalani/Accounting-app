-- REVIEWED DESTINATION ONLY, after live-schema verification; never on source.
-- Execute separately as the owner of auth.users/workspace tables, after restore.
CREATE OR REPLACE FUNCTION public.accept_workspace_invitation(invitation_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE invite public.workspace_invitations%ROWTYPE;
DECLARE requester uuid := (SELECT auth.uid());
DECLARE recipient_email text;
BEGIN
  IF requester IS NULL OR invitation_token !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT email INTO recipient_email FROM auth.users WHERE id = requester;
  SELECT * INTO invite FROM public.workspace_invitations
  WHERE token = invitation_token AND accepted_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND OR recipient_email IS NULL OR lower(invite.email) IS DISTINCT FROM lower(recipient_email) THEN
    RAISE EXCEPTION 'Invitation unavailable' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (invite.workspace_id, requester, 'member')
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
  UPDATE public.workspace_invitations SET accepted_at = now() WHERE id = invite.id;
  RETURN invite.workspace_id;
END;
$$;
REVOKE ALL ON FUNCTION public.accept_workspace_invitation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_workspace_invitation(text) TO authenticated;
