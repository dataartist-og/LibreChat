const path = require('path');
const mongoose = require('mongoose');
const { createModels, logger } = require('@librechat/data-schemas');

require('module-alias')({ base: path.resolve(__dirname, '..', 'api') });
const connect = require('./connect');

async function migrateInlineVisualizations({ dryRun = true } = {}) {
  await connect();
  createModels(mongoose);

  const VisualizationArtifact = mongoose.models.VisualizationArtifact;
  if (!VisualizationArtifact) {
    throw new Error('VisualizationArtifact model is not available');
  }

  const collectionName = VisualizationArtifact.collection.name;
  const collectionExists = await mongoose.connection.db
    .listCollections({ name: collectionName })
    .hasNext();

  if (dryRun) {
    const documents = collectionExists ? await VisualizationArtifact.countDocuments({}) : 0;
    const indexes = collectionExists ? await VisualizationArtifact.collection.indexes() : [];

    return {
      dryRun: true,
      collection: collectionName,
      collectionExists,
      documents,
      indexes: indexes.map((index) => index.name),
      backfillRequired: false,
    };
  }

  await VisualizationArtifact.createCollection().catch((error) => {
    if (error?.codeName !== 'NamespaceExists') {
      throw error;
    }
  });

  const syncedIndexes = await VisualizationArtifact.syncIndexes();

  logger.info('Inline visualization bootstrap completed', {
    collection: collectionName,
    syncedIndexes,
  });

  return {
    dryRun: false,
    collection: collectionName,
    syncedIndexes,
    backfillRequired: false,
  };
}

if (require.main === module) {
  const dryRun = process.argv.includes('--dry-run');

  migrateInlineVisualizations({ dryRun })
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch((error) => {
      console.error('Inline visualization migration failed:', error);
      process.exit(1);
    });
}

module.exports = { migrateInlineVisualizations };
