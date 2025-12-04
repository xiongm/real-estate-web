---
description: How to verify changes to the web application
---

1. After making changes to the `web/` directory, you must rebuild the docker container to see them reflected in the browser.
2. Run the following command:
   ```bash
   // turbo
   docker compose up -d --build web
   ```
3. Wait for the container to be healthy (you can use `curl -I http://localhost:3000` to check).
4. Verify the changes in the browser.
