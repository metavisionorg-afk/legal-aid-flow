# Development Environment Troubleshooting

## Common Issues

### Accidental Heredoc Pasting in Terminal

**Problem**: Pasting multi-line commands (heredocs like `cat >> .env <<'EOF'`) into terminal can corrupt command history.

**Solutions**:
1. **Use single quotes in node -e commands**:
   ```bash
   # ✅ Safe (single quotes prevent expansion)
   node -e 'console.log(process.env.ZOOM_ACCOUNT_ID)'
   
   # ❌ Dangerous (double quotes can cause issues)
   node -e "console.log(process.env.ZOOM_ACCOUNT_ID)"
   ```

2. **Use npm scripts instead**:
   ```bash
   # Check Zoom env vars
   npm run zoom:env
   
   # Validate i18n JSON files
   npm run i18n:json
   ```

3. **Clear corrupted command line**:
   - **zsh/bash**: Press `Ctrl+U` to clear entire line
   - **zsh**: Press `Ctrl+C` to cancel current command

### Zoom Integration Setup

Check Zoom credentials without manual inspection:
```bash
npm run zoom:env
```

Expected output:
```
ZOOM_ACCOUNT_ID: SET
ZOOM_CLIENT_ID: SET
ZOOM_CLIENT_SECRET: SET

Zoom Integration: ENABLED
```

### JSON Validation

Validate locale files:
```bash
npm run i18n:json
```

This checks `client/src/locales/en.json` and `client/src/locales/ar.json` for syntax errors.
