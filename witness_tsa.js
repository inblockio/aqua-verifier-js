import * as fs from "fs"
import * as asn1js from "asn1js"
import * as pkijs from "pkijs"
import { createHash } from "node:crypto"

const isoDate2unix = (t) => {
  return Math.floor(new Date(t).getTime() / 1000)
}

const extractGenTimeFromResp = (resp) => {
  const signedData = new pkijs.SignedData({
    schema: resp.timeStampToken.content,
  })
  const tstInfoAsn1 = asn1js.fromBER(
    signedData.encapContentInfo.eContent.valueBlock.valueHexView,
  )
  const tstInfo = new pkijs.TSTInfo({ schema: tstInfoAsn1.result })
  return isoDate2unix(tstInfo.genTime)
}

const witness = async (hash, tsaUrl) => {
  // DigiCert only supports up to SHA256
  const hashHex = createHash("sha256").update(hash).digest("hex")
  const hashBuffer = Uint8Array.from(Buffer.from(hashHex, "hex")) // Convert hex to ArrayBuffer
  const tspReq = new pkijs.TimeStampReq({
    version: 1,
    messageImprint: new pkijs.MessageImprint({
      hashAlgorithm: new pkijs.AlgorithmIdentifier({
        algorithmId: "2.16.840.1.101.3.4.2.1", // OID for SHA2-256
      }),
      hashedMessage: new asn1js.OctetString({ valueHex: hashBuffer.buffer }),
    }),
    nonce: new asn1js.Integer({ value: Date.now() }),
    certReq: true,
  })

  // Encode the TimeStampReq to DER format
  const tspReqSchema = tspReq.toSchema()
  const tspReqBuffer = tspReqSchema.toBER(false)

  const response = await fetch(tsaUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/timestamp-query",
    },
    body: tspReqBuffer,
  })

  const tspResponseBuffer = await response.arrayBuffer()

  const tspResponseAsn1 = asn1js.fromBER(tspResponseBuffer)
  const tspResponse = new pkijs.TimeStampResp({
    schema: tspResponseAsn1.result,
  })

  if (tspResponse.status.status !== 0) {
    console.log("TSA response is invalid. Failed to witness")
    process.exit(1)
  }
  const base64EncodedResp = Buffer.from(tspResponseBuffer).toString("base64")
  const witnessTimestamp = extractGenTimeFromResp(tspResponse)

  return [base64EncodedResp, "DigiCert", witnessTimestamp]
}

const verify = async (transactionHash, expectedMR, expectedTimestamp) => {
  const tspResponseBuffer = Buffer.from(transactionHash, "base64")
  const tspResponseAsn1 = asn1js.fromBER(tspResponseBuffer)
  const tspResponse = new pkijs.TimeStampResp({
    schema: tspResponseAsn1.result,
  })

  const signedData = new pkijs.SignedData({
    schema: tspResponse.timeStampToken.content,
  })
  const tstInfoAsn1 = asn1js.fromBER(
    signedData.encapContentInfo.eContent.valueBlock.valueHexView,
  )
  const tstInfo = new pkijs.TSTInfo({ schema: tstInfoAsn1.result })

  if (isoDate2unix(tstInfo.genTime) !== expectedTimestamp) {
    return false
  }

  // Verifying the content itself
  const hashHex = createHash("sha256").update(expectedMR).digest("hex")

  const messageImprintHash = Buffer.from(
    tstInfo.messageImprint.hashedMessage.valueBlock.valueHexView,
  ).toString("hex")
  return messageImprintHash === hashHex
}

export { witness, verify }
