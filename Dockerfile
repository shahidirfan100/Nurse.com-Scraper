FROM apify/actor-node:22

RUN npm ls apify

# Copy package files first so dependency installation stays cached between source changes.
COPY --chown=myuser:myuser package*.json ./

# Install production dependencies and verify the platform-selected impit binary.
RUN npm --quiet set progress=false \
    && npm install --omit=dev --no-audit --no-fund \
    && node -e "import('impit').then(m => console.log('impit OK:', Object.keys(m)))" \
    && echo "Installed NPM packages:" \
    && (npm list --omit=dev --all || true) \
    && echo "Node.js version:" \
    && node --version \
    && echo "NPM version:" \
    && npm --version \
    && rm -r ~/.npm

COPY --chown=myuser:myuser . ./

CMD ["node", "src/main.js"]
