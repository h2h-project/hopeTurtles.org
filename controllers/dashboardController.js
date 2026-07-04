import missionsModel from '../models/missionsModel.js';
import turtlesModel from '../models/turtlesModel.js';
import telemetryModel from '../models/telemetryModel.js';
import successModel from '../models/successModel.js';
import alertsModel from '../models/alertsModel.js';
import hubsModel from '../models/hubsModel.js';
import boatsModel from '../models/boatsModel.js';
import usersModel from '../models/usersModel.js';
import bottlesModel from '../models/bottlesModel.js';

export const renderDashboard = async (req, res, next) => {
  try {
    let currentUser = req.session?.user || null;
    const buwanaId = currentUser?.buwanaId ?? currentUser?.id ?? null;

    const dashboardUser = buwanaId ? await usersModel.findByBuwanaId(buwanaId) : null;

    if (dashboardUser) {
      const firstName =
        dashboardUser.first_name ||
        (dashboardUser.full_name ? dashboardUser.full_name.split(/\s+/u)[0] : null) ||
        currentUser?.firstName ||
        null;

      currentUser = {
        ...currentUser,
        id: dashboardUser.buwana_id,
        buwanaId: dashboardUser.buwana_id,
        email: dashboardUser.email,
        name: dashboardUser.full_name || firstName || currentUser?.name || null,
        firstName,
        lastLogin: dashboardUser.last_login || currentUser?.lastLogin || null,
        role: dashboardUser.role
      };

      req.session.user = currentUser;
      res.locals.currentUser = currentUser;
    }

    const isAdmin = Boolean(currentUser && currentUser.role === 'admin');

    const hubsPromise = isAdmin ? hubsModel.getAllWithStats() : hubsModel.getAll();
    const boatsPromise = isAdmin ? boatsModel.getAllWithStats() : boatsModel.getAll();
    const usersPromise = isAdmin ? usersModel.getAll() : Promise.resolve([]);
    const turtleDetailsPromise = isAdmin ? turtlesModel.getAllWithRelations() : Promise.resolve([]);
    const managedTurtlesPromise = buwanaId
      ? turtlesModel.getManagedWithRelations(buwanaId)
      : Promise.resolve([]);
    const userBottlesPromise = buwanaId
      ? bottlesModel.getForPackerWithDetails(buwanaId)
      : Promise.resolve([]);

    const [
      missions,
      turtles,
      telemetry,
      successEntries,
      alerts,
      hubs,
      boats,
      users,
      turtleDetails,
      managedTurtles,
      userBottles
    ] = await Promise.all([
      missionsModel.getAllWithStats(),
      turtlesModel.getAll(),
      telemetryModel.getLatest(),
      successModel.getRecent(10),
      alertsModel.getActive(),
      hubsPromise,
      boatsPromise,
      usersPromise,
      turtleDetailsPromise,
      managedTurtlesPromise,
      userBottlesPromise
    ]);
    return res.render('dashboard', {
      pageTitle: 'Dashboard',
      missions,
      turtles,
      telemetry,
      successEntries,
      alerts,
      dashboardUser,
      hubs: Array.isArray(hubs) ? hubs : [],
      boats: Array.isArray(boats) ? boats : [],
      users: Array.isArray(users) ? users : [],
      turtleDetails: Array.isArray(turtleDetails) ? turtleDetails : [],
      managedTurtles: Array.isArray(managedTurtles) ? managedTurtles : [],
      userBottles: Array.isArray(userBottles) ? userBottles : []
    });
  } catch (error) {
    return next(error);
  }
};

export const renderMyTurtle = async (req, res, next) => {
  try {
    const turtle = await turtlesModel.getWithRelationsById(req.params.id);

    const currentUser = req.session?.user || null;
    const isAdmin = currentUser?.role === 'admin';
    const managerIdRaw = currentUser?.buwanaId ?? currentUser?.id ?? null;
    const hasManagerId = managerIdRaw !== undefined && managerIdRaw !== null && managerIdRaw !== '';
    const turtleHasManager =
      turtle?.turtle_manager !== undefined && turtle?.turtle_manager !== null && turtle?.turtle_manager !== '';
    const managesTurtle =
      hasManagerId && turtleHasManager && String(turtle.turtle_manager) === String(managerIdRaw);

    if (!turtle || (!isAdmin && !managesTurtle)) {
      return res.status(404).render('error', {
        pageTitle: 'Turtle not found',
        message: 'This turtle does not exist or is not managed by your account.'
      });
    }

    delete turtle.secret_hash;

    const latestReading = await telemetryModel.getLatestForTurtle(turtle.turtle_id);
    let latestValues = null;
    if (latestReading?.raw_data) {
      const raw =
        typeof latestReading.raw_data === 'string'
          ? JSON.parse(latestReading.raw_data)
          : latestReading.raw_data;
      latestValues = raw?.values ?? raw ?? null;
    }

    return res.render('myturtle', {
      pageTitle: turtle.name || `Turtle #${turtle.turtle_id}`,
      turtle,
      latestReading,
      latestValues
    });
  } catch (error) {
    return next(error);
  }
};

export const renderAdmin = async (req, res, next) => {
  try {
    const sessionUser = req.session?.user || null;
    const buwanaId = sessionUser?.buwanaId ?? sessionUser?.id ?? null;
    const dashboardUser = buwanaId ? await usersModel.findByBuwanaId(buwanaId) : null;

    // Keep the session role in sync with the DB so freshly-granted admin
    // rights take effect without needing to log out and back in.
    if (dashboardUser && req.session?.user) {
      req.session.user.role = dashboardUser.role;
      res.locals.currentUser = req.session.user;
    }

    const [
      missionsResult,
      turtleDetailsResult,
      hubsResult,
      boatsResult,
      alertsResult,
      usersResult,
      userStatsResult
    ] = await Promise.all([
      missionsModel.getAllWithStats(),
      turtlesModel.getAllWithRelations(),
      hubsModel.getAllWithStats(),
      boatsModel.getAllWithStats(),
      alertsModel.getAll(),
      usersModel.getAll(),
      usersModel.getDashboardStats()
    ]);
    return res.render('admin', {
      pageTitle: 'Admin Tools',
      missions: Array.isArray(missionsResult) ? missionsResult : [],
      turtleDetails: Array.isArray(turtleDetailsResult) ? turtleDetailsResult : [],
      hubs: Array.isArray(hubsResult) ? hubsResult : [],
      boats: Array.isArray(boatsResult) ? boatsResult : [],
      alerts: Array.isArray(alertsResult) ? alertsResult : [],
      users: Array.isArray(usersResult) ? usersResult : [],
      userStats: userStatsResult || null,
      dashboardUser
    });
  } catch (error) {
    return next(error);
  }
};

export default {
  renderDashboard,
  renderMyTurtle,
  renderAdmin
};
