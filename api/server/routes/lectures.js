const express = require('express');
const {
  lectureSourceHandler,
  lectureAskHandler,
  lectureIndexHandler,
  lectureImportHandler,
  lectureNotesHandler,
  lectureYouTubeHandler,
  lectureVoiceStatusHandler,
  lectureVoiceStartHandler,
  lectureVoiceStopHandler,
} = require('@librechat/api');
const {
  requireJwtAuth,
  configMiddleware,
  checkBan,
  uaParser,
  messageIpLimiter,
  messageUserLimiter,
} = require('~/server/middleware');

const router = express.Router();
router.use(requireJwtAuth, configMiddleware, checkBan, uaParser);
router.use(messageIpLimiter, messageUserLimiter);
router.post('/source', lectureSourceHandler);
router.post('/ask', lectureAskHandler);
router.post('/index', lectureIndexHandler);
router.post('/import', lectureImportHandler);
router.post('/notes', lectureNotesHandler);
router.post('/youtube', lectureYouTubeHandler);
router.get('/voice', lectureVoiceStatusHandler);
router.post('/voice', lectureVoiceStartHandler);
router.post('/voice/stop', lectureVoiceStopHandler);

module.exports = router;
