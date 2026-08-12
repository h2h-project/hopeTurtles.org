import componentsModel from '../models/componentsModel.js';
import commissionsModel from '../models/commissionsModel.js';
import missionsModel from '../models/missionsModel.js';

const DEPLOYMENT_TYPES = ['flotilla', 'self'];
const SHIPPING_ESTIMATE_USD = 20;

const getCurrentUserId = (req) => req.session?.user?.buwanaId ?? null;

// Looks up every component referenced by the submission in one query and
// returns a Map (keyed by component_id as a string, since mysql2 may return
// BIGINT ids as either a string or a number) so price/availability is always
// taken from the DB, never trusted from the client payload.
const loadComponentsByIds = async (ids) => {
  const uniqueIds = [...new Set(ids.filter(Boolean).map(String))];
  if (!uniqueIds.length) return new Map();
  const catalog = await componentsModel.getCatalog();
  const allComponents = Object.values(catalog).flat();
  const byId = new Map(allComponents.map((component) => [String(component.component_id), component]));
  return new Map(uniqueIds.map((id) => [id, byId.get(id)]).filter(([, c]) => c));
};

export const createCommission = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    if (!buwanaId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }

    const {
      mission_id: missionId,
      deployment_type: deploymentTypeRaw,
      turtle_base_component_id: turtleBaseId,
      engraving_component_id: engravingId,
      items: rawItems,
      status: statusRaw
    } = req.body || {};

    const deploymentType = DEPLOYMENT_TYPES.includes(deploymentTypeRaw) ? deploymentTypeRaw : 'flotilla';
    const status = statusRaw === 'submitted' ? 'submitted' : 'draft';

    if (!turtleBaseId) {
      return res.status(422).json({ success: false, message: 'A turtle base model is required.' });
    }

    if (missionId && !(await missionsModel.getById(missionId))) {
      return res.status(422).json({ success: false, message: 'Selected mission is not available.' });
    }

    const items = Array.isArray(rawItems) ? rawItems : [];
    const componentsById = await loadComponentsByIds([
      turtleBaseId,
      engravingId,
      ...items.map((item) => item.component_id)
    ]);

    const turtleBase = componentsById.get(String(turtleBaseId));
    if (!turtleBase || turtleBase.category !== 'turtle_base') {
      return res.status(422).json({ success: false, message: 'Selected turtle base is not available.' });
    }

    const engraving = engravingId ? componentsById.get(String(engravingId)) : null;
    if (engravingId && engraving?.category !== 'engraving') {
      return res.status(422).json({ success: false, message: 'Selected engraving is not available.' });
    }

    let subtotal = Number(turtleBase.price_usd);
    const lineItems = [];
    for (const item of items) {
      const component = componentsById.get(String(item.component_id));
      if (!component) {
        return res.status(422).json({ success: false, message: 'One of the selected components is not available.' });
      }
      const quantity = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
      const unitPrice = Number(component.price_usd);
      subtotal += unitPrice * quantity;
      lineItems.push({
        component_id: component.component_id,
        bottle_slot: item.bottle_slot ?? null,
        quantity,
        unit_price_usd: unitPrice
      });
    }

    const commissionId = await commissionsModel.createWithItems(
      {
        buwana_id: buwanaId,
        mission_id: missionId || null,
        deployment_type: deploymentType,
        turtle_base_component_id: turtleBase.component_id,
        engraving_component_id: engraving?.component_id || null,
        status,
        estimated_subtotal_usd: subtotal,
        shipping_estimate_usd: SHIPPING_ESTIMATE_USD
      },
      lineItems
    );

    const commission = await commissionsModel.getByIdForUser(commissionId, buwanaId);
    return res.status(201).json({ success: true, data: commission });
  } catch (error) {
    return next(error);
  }
};

export const listMyCommissions = async (req, res, next) => {
  try {
    const buwanaId = getCurrentUserId(req);
    if (!buwanaId) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const commissions = await commissionsModel.getAll({ buwana_id: buwanaId });
    return res.json({ success: true, data: commissions });
  } catch (error) {
    return next(error);
  }
};
