-- Add CSV import configuration column to payment_methods table
-- This stores the column mapping and amount format settings for future CSV imports

alter table public.payment_methods
add column csv_import_config jsonb;

comment on column public.payment_methods.csv_import_config is 'Stores CSV import configuration including column mappings and amount format settings';

