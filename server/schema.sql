-- Installed only by the operator. Runtime has no DDL privileges.
create schema pfig_cash authorization pfig_cash_owner;
revoke all on schema pfig_cash from public;
set local role pfig_cash_owner;
create table pfig_cash.workspaces (
  id text primary key check (id = 'main'), revision integer not null check (revision > 0),
  storage jsonb not null check (jsonb_typeof(storage) = 'object'), updated_at timestamptz not null default now()
);
create table pfig_cash.assets (name text primary key, payload jsonb not null);
create table pfig_cash.workspace_events (
  request_id uuid primary key, client_id uuid not null, revision integer not null unique,
  request_hash text not null, changed_keys text[] not null, before_values jsonb not null,
  after_values jsonb not null, created_at timestamptz not null default now()
);
create table pfig_cash.companies (code text primary key, name text not null);
create table pfig_cash.customers (
  company text not null references pfig_cash.companies(code), customer_code text not null, name text not null,
  details jsonb not null, primary key (company, customer_code)
);
create table pfig_cash.sales_lines (
  source_row integer primary key, company text not null references pfig_cash.companies(code), customer_code text not null,
  bill_no text not null, document_date text not null, amount numeric(20,4) not null, details jsonb not null
);
create table pfig_cash.receivable_bills (
  source_row integer not null, company text not null references pfig_cash.companies(code), customer_code text not null,
  bill_no text not null, document_date text not null, amount numeric(20,4) not null, details jsonb not null,
  primary key (company, customer_code, bill_no)
);
create table pfig_cash.receipt_lines (
  source_row integer primary key, company text not null references pfig_cash.companies(code), customer_code text not null,
  bill_no text not null, document_date text not null, amount numeric(20,4) not null, details jsonb not null
);
create table pfig_cash.cash_entries (
  id text primary key, document_date text not null, type text not null check (type in ('in','out')),
  amount numeric(20,4) not null, details jsonb not null
);
create index sales_bill_lookup on pfig_cash.sales_lines(company, customer_code, bill_no);
create index receipt_bill_lookup on pfig_cash.receipt_lines(company, customer_code, bill_no);
reset role;
grant usage on schema pfig_cash to pfig_cash_app;
grant select on all tables in schema pfig_cash to pfig_cash_app;
grant update (revision, storage, updated_at) on pfig_cash.workspaces to pfig_cash_app;
grant insert on pfig_cash.workspace_events to pfig_cash_app;
grant insert, update, delete on pfig_cash.companies, pfig_cash.customers, pfig_cash.sales_lines,
  pfig_cash.receivable_bills, pfig_cash.receipt_lines, pfig_cash.cash_entries to pfig_cash_app;
