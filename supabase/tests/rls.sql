begin;
select plan(4);

select has_table('public', 'todos', 'todos table exists');
select row_security_active('public.todos'::regclass) as "todos enables RLS";
select policies_are('public', 'todos', array['todos_own_all'], 'todos has explicit owner policy');
select col_is_unique('public', 'categories', 'id', 'category id is unique');

select * from finish();
rollback;
