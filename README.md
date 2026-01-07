## Local dev: disable pager for psql
Set `PAGER=cat` and `LESS=-F -X` (see `.env.local`) to avoid interactive pager prompts in `psql` output.
