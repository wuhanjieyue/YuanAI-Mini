import { callHttp } from './http'

async function billingRequest(path, body = {}) {
  const { statusCode, result } = await callHttp('/billing/' + path, body)
  if (statusCode !== 200 || result.code !== 200) {
    const error = new Error(result.msg || '额度服务暂不可用')
    error.code = result.code
    throw error
  }
  return result.data
}

export function getBillingSummary() { return billingRequest('summary') }
export function getBillingOrder(orderId) { return billingRequest('orders/status', { orderId }) }
export function createBillingOrder(productType, amountYuan, clientRequestId) {
  if (!Number.isInteger(amountYuan) || amountYuan < 1 || amountYuan > 10000) throw new Error('购买金额必须为整数元')
  if (productType === 'points_purchase' && amountYuan !== 30) throw new Error('购买额度仅支持30元固定套餐')
  return billingRequest('orders', { productType, amountYuan, clientRequestId })
}

export async function payBillingOrder(productType, amountYuan, clientRequestId) {
  const order = await createBillingOrder(productType, amountYuan, clientRequestId)
  if (order.status === 'paid') return order
  await new Promise((resolve, reject) => wx.requestPayment({ ...order.payment, success: resolve, fail: reject }))
  // Payment UI success is not an entitlement receipt; the signed callback owns fulfillment.
  return order
}

export async function waitBillingOrder(orderId, active = () => true) {
  for (let attempt = 0; attempt < 5 && active(); attempt++) {
    const status = await getBillingOrder(orderId)
    if (status.fulfilled) return status
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return { orderId, status: 'pending', fulfilled: false }
}
