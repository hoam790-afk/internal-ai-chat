module.exports = {
  apps: [
    {
      name: "internal-ai-chat",
      script: "backend/server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 4000
      }
    }
  ]
};
