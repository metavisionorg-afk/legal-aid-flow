## Local dev: disable pager for psql
Set `PAGER=cat` and `LESS=-F -X` (see `.env.local`) to avoid interactive pager prompts in `psql` output.
## macOS Port Conflict Note

On macOS, port 5000 may be reserved by ControlCenter.app, which can block the dev server from starting. To avoid this, set a custom port in a `.env` file:

```
PORT=5002
```

The project uses `.env` → PORT for development. Production environments should continue to use environment variables as before.

App will be reachable at http://localhost:5002 when running locally.
