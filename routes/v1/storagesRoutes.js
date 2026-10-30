const express = require('express');
const router = express.Router();
const storageController = require('../../controllers/v1/storageController');
const verifyToken = require('../../middlewares/verifyToken');

//Done and Tested
// Allows multiple get,post,patch,put,delete by using the , (comma) each index is one object
// post allows create throws error if already exist
// patch allows update throws error if not exist or if exist and the user has no set access for it
// put allows create/update throws only when exist and user has no set access for it
// for get functionality the null means all/any, for example :platform is null then get any platform with :organization etc
// the return of get is in format of data.platform.organization.app.collection.key = value
router.get('/:storageId/:platform/:organization/:company/:app/:collection/:key', verifyToken, storageController.getItems);
router.post('/:storageId/:platform/:organization/:company/:app/:collection/:key', verifyToken, storageController.postItems);
router.patch('/:storageId/:platform/:organization/:company/:app/:collection/:key', verifyToken, storageController.patchItems);
router.put('/:storageId/:platform/:organization/:company/:app/:collection/:key', verifyToken, storageController.putItems);
router.delete('/:storageId/:platform/:organization/:company/:app/:collection/:key', verifyToken, storageController.deleteItems);

router.get('/anonymous-storages/:platform/:organization/:company/:app/:collection/:key', storageController.getItems);

module.exports = router;
