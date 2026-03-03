module.exports = {
  apps: [
    {
      name: "ooh-annotator",
      script: "dist/annotator/server.js",
      // pm2 будет запускаться из директории deploy-скрипта Forge
      // (обычно /home/forge/your-site.com/current), поэтому cwd можно не задавать.
      env: {
        NODE_ENV: "production",
        ANNOTATOR_PORT: 3000,
      },
    },
  ],
};

