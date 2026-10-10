export const EMPTY_AREA_SELECTION = {
  pradeshGroupIds: [],
  pradeshIds: [],
  mandalGroupIds: [],
  mandalIds: [],
  sabhaGroupIds: [],
  sabhaIds: [],
};

export const AREA_LEVELS = [
  {
    key: 'pradeshGroupIds',
    opt: 'pradesh_groups',
    show: 'show_pradesh_group',
    label: 'Pradesh group',
    all: 'All Pradesh Groups',
  },
  {
    key: 'pradeshIds',
    opt: 'pradeshes',
    show: 'show_pradesh',
    label: 'Pradesh',
    all: 'All Pradeshes',
  },
  {
    key: 'mandalGroupIds',
    opt: 'mandal_groups',
    show: 'show_mandal_group',
    label: 'Mandal group',
    all: 'All Mandal Groups',
  },
  {
    key: 'mandalIds',
    opt: 'mandals',
    show: 'show_mandal',
    label: 'Mandal',
    all: 'All Mandals',
  },
  {
    key: 'sabhaGroupIds',
    opt: 'sabha_groups',
    show: 'show_sabha_group',
    label: 'Sabha group',
    all: 'All Sabha Groups',
  },
  {
    key: 'sabhaIds',
    opt: 'sabhas',
    show: 'show_sabha',
    label: 'Sabha',
    all: 'All Sabhas',
  },
];

function asStrSet(values) {
  return new Set((values || []).map(String));
}

function optionsAt(levelKey, filters) {
  return filters?.[AREA_LEVELS.find(level => level.key === levelKey).opt] || [];
}

function optionCoverage(levelKey, option, filters) {
  if (
    levelKey === 'pradeshGroupIds' ||
    levelKey === 'mandalGroupIds' ||
    levelKey === 'sabhaGroupIds'
  ) {
    return new Set((option?.sabha_ids || []).map(String));
  }
  if (levelKey === 'pradeshIds') {
    return new Set(
      (filters?.sabhas || [])
        .filter(item => String(item.pradesh_id) === String(option.id))
        .map(item => String(item.id)),
    );
  }
  if (levelKey === 'mandalIds') {
    return new Set(
      (filters?.sabhas || [])
        .filter(item => String(item.mandal_id) === String(option.id))
        .map(item => String(item.id)),
    );
  }
  return new Set([String(option.id)]);
}

function levelCoverage(levelKey, ids, filters) {
  if (!ids || !ids.length) return null;
  const selected = asStrSet(ids);
  const covered = new Set();

  optionsAt(levelKey, filters)
    .filter(option => selected.has(String(option.id)))
    .forEach(option => {
      optionCoverage(levelKey, option, filters).forEach(id =>
        covered.add(String(id)),
      );
    });

  return covered;
}

function intersectSets(a, b) {
  const result = new Set();
  a.forEach(value => {
    if (b.has(value)) result.add(value);
  });
  return result;
}

function ancestorAllowed(idx, selection, filters) {
  let allowed = null;
  for (let i = 0; i < idx; i += 1) {
    const covered = levelCoverage(
      AREA_LEVELS[i].key,
      selection[AREA_LEVELS[i].key],
      filters,
    );
    if (covered) {
      allowed = allowed === null ? covered : intersectSets(allowed, covered);
    }
  }
  return allowed;
}

export function availableAt(idx, selection, filters) {
  const allowed = ancestorAllowed(idx, selection, filters);
  const options = optionsAt(AREA_LEVELS[idx].key, filters);
  if (allowed === null) return options;
  return options.filter(option => {
    const coverage = optionCoverage(AREA_LEVELS[idx].key, option, filters);
    for (const value of coverage) {
      if (allowed.has(value)) return true;
    }
    return false;
  });
}

export function pruneSelection(selection, filters) {
  const value = { ...EMPTY_AREA_SELECTION, ...(selection || {}) };
  const next = { ...value };

  for (let i = 0; i < AREA_LEVELS.length; i += 1) {
    const levelKey = AREA_LEVELS[i].key;
    const available = new Set(
      availableAt(i, next, filters).map(option => String(option.id)),
    );
    next[levelKey] = (next[levelKey] || []).filter(id =>
      available.has(String(id)),
    );
  }

  return next;
}

export function computeSabhaIds(selection, filters) {
  if (!filters) return [];
  const value = { ...EMPTY_AREA_SELECTION, ...(selection || {}) };
  let allowed = null;
  let anySelected = false;

  for (const level of AREA_LEVELS) {
    const covered = levelCoverage(level.key, value[level.key], filters);
    if (covered) {
      anySelected = true;
      allowed = allowed === null ? covered : intersectSets(allowed, covered);
    }
  }

  if (!anySelected || !allowed) return [];
  return [...allowed];
}

/**
 * The selection that names one Sabha at every level on offer: the Sabha
 * itself, and each group, Mandal and Pradesh that holds it.
 */
export function selectionForSabha(sabhaId, filters) {
  const value = { ...EMPTY_AREA_SELECTION };
  if (sabhaId == null || !filters) return value;
  for (const level of AREA_LEVELS) {
    if (!filters[level.show]) continue;
    value[level.key] = optionsAt(level.key, filters)
      .filter(option =>
        optionCoverage(level.key, option, filters).has(String(sabhaId)),
      )
      .map(option => option.id);
  }
  return pruneSelection(value, filters);
}
