const express = require('express');
const router = express.Router();

router.use('/auths', require('./authsRoutes'));
router.use('/storages', require('./storagesRoutes'));
router.use('/users', require('./usersRoutes'));
router.use('/roles', require('./rolesRoutes'));
router.use('/processes', require('./processesRoutes'));
router.use('/barangay', require('./barangayRoutes'));

module.exports = router;
