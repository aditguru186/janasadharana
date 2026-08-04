'use strict';

const CATEGORIES = [
  'water',
  'electricity',
  'domestic_help',
  'sewage',
  'roads',
  'sanitation',
  'streetlight',
  'other',
  'dharta',
  'cow_welfare'
];

const STATUSES = ['open', 'assigned', 'in_progress', 'resolved', 'rejected'];

const CATEGORY_LABELS = {
  water: 'Water',
  electricity: 'Electricity',
  domestic_help: 'Domestic Help',
  sewage: 'Sewage',
  roads: 'Roads',
  sanitation: 'Sanitation',
  streetlight: 'Street Light',
  other: 'Other',
  dharta: 'Dharta',
  cow_welfare: 'Cow Welfare'
};

const STATUS_LABELS = {
  open: 'Open',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected'
};

/** Valid next statuses from current status */
const STATUS_TRANSITIONS = {
  // Staff can assign, start work, or reject from open
  open: ['assigned', 'in_progress', 'rejected'],
  assigned: ['in_progress', 'open', 'rejected'],
  in_progress: ['resolved', 'assigned', 'rejected'],
  resolved: [],
  rejected: ['open']
};

const ROLES = {
  CITIZEN: 'citizen',
  OFFICER: 'officer',
  ADMIN: 'admin'
};

module.exports = {
  CATEGORIES,
  STATUSES,
  CATEGORY_LABELS,
  STATUS_LABELS,
  STATUS_TRANSITIONS,
  ROLES
};
