function SuccessResponse(
    httpCode,
    msg,
    data,
    meta,
  ) {
    const body = {
      responseCode: httpCode,
      status: true,
      message: msg,
      data: data,
      meta: meta,
    };
  
    return body;
  }
  
  
function ErrorResponse(
    httpCode,
    msg,
    data,
    meta,
  ) {
    const body = {
      responseCode: httpCode,
      status: false,
      message: msg,
      data: data,
      meta: meta,
    };
  
    return body;
  }


module.exports ={
    SuccessResponse,
    ErrorResponse
}