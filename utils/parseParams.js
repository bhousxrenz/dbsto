exports.parseParamArray = (param) => {
  if (!param || param === 'null') return null;
  return param.split(','); // split by comma
};