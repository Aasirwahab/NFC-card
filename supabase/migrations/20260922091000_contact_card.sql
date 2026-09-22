-- "Save the rep's contact" (spec §26, Phase 5).
--
-- The vCard on the prospect page carries the rep's own details. profiles had no
-- email, and the sign-in address is not the rep's to publish by default — many
-- people sign up with a personal one. So the contact email is its own field, set
-- deliberately in Setup, and left off the card when blank.

alter table public.profiles
  add column contact_email text
    check (contact_email is null or char_length(contact_email) <= 254);
