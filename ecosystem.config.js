module.exports = {
  apps: [
    {
      name: 'ingestion',
      script: 'dist/services/ingestion.js',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'processor',
      script: 'dist/services/processor.js',
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'reporting',
      script: 'dist/services/reporting.js',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
}
