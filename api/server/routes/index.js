const accessPermissions = require('./accessPermissions');
const assistants = require('./assistants');
const categories = require('./categories');
const adminAuth = require('./admin/auth');
const adminConfig = require('./admin/config');
const adminGrants = require('./admin/grants');
const adminGroups = require('./admin/groups');
const adminRoles = require('./admin/roles');
const adminUsers = require('./admin/users');
const endpoints = require('./endpoints');
const staticRoute = require('./static');
const messages = require('./messages');
const learners = require('./learners');
const lectures = require('./lectures');
const memories = require('./memories');
const presets = require('./presets');
const prompts = require('./prompts');
const balance = require('./balance');
const actions = require('./actions');
const apiKeys = require('./apiKeys');
const banner = require('./banner');
const search = require('./search');
const models = require('./models');
const convos = require('./convos');
const projects = require('./projects');
const conversations = require('./conversations');
const clarifications = require('./clarifications');
const dialogs = require('./dialogs');
const documents = require('./documents');
const visualizations = require('./visualizations');
const config = require('./config');
const agents = require('./agents');
const roles = require('./roles');
const oauth = require('./oauth');
const files = require('./files');
const share = require('./share');
const tags = require('./tags');
const auth = require('./auth');
const keys = require('./keys');
const user = require('./user');
const mcp = require('./mcp');

module.exports = {
  mcp,
  auth,
  adminAuth,
  adminConfig,
  adminGrants,
  adminGroups,
  adminRoles,
  adminUsers,
  keys,
  apiKeys,
  user,
  tags,
  roles,
  oauth,
  files,
  share,
  banner,
  agents,
  convos,
  projects,
  conversations,
  clarifications,
  dialogs,
  documents,
  visualizations,
  search,
  config,
  models,
  prompts,
  actions,
  presets,
  balance,
  messages,
  learners,
  lectures,
  memories,
  endpoints,
  assistants,
  categories,
  staticRoute,
  accessPermissions,
};
