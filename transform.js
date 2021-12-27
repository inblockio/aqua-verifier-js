const xml2js = require('xml2js')

function transformMwXmlRevision2PkcJson(rev) {
  if (!(rev.format === 'text/x-wiki' && rev.model === 'wikitext')) {
    throw "We only support parsing wikitext for now"
  }
  const verification = rev.verification
  const out = {
    verification_context: JSON.parse(verification.verification_context),
    content: {
      rev_id: rev.id,
      content: rev.text['_'],
      content_hash: verification.content_hash,
    },
    metadata: {
      domain_id: verification.domain_id,
      time_stamp: verification.time_stamp,
      metadata_hash: verification.metadata_hash,
    },
  }
  // Optional fields
  if ("previous_verification_hash" in verification) {
    out.metadata.previous_verification_hash = verification.previous_verification_hash
  }
  if ("signature" in verification) {
    out.signature = {
      signature: verification.signature,
      public_key: verification.public_key,
      wallet_address: verification.wallet_address,
      signature_hash: verification.signature_hash,
    }
  }
  if ("witness" in verification) {
    out.witness = verification.witness
    out.witness.structured_merkle_proof = JSON.parse(out.witness.structured_merkle_proof)
  }
  return out
}

function transformRevisions(revisions) {
  const out = {}
  for (const rev of revisions) {
    out[rev.verification.verification_hash] = transformMwXmlRevision2PkcJson(rev)
  }
  return out
}

async function parseMWXmlString(fileContent) {
  const parsed = await xml2js.parseStringPromise(fileContent, {explicitArray : false})
  // TODO we parse 1 page only for now
  const pageData = parsed.mediawiki.page
  const offline_data = {
    title: pageData.title,
    data_accounting_chain_height: pageData.data_accounting_chain_height,
    version: "TODO",
    revisions: transformRevisions(pageData.revision)
  }
  return offline_data
}

module.exports = {
  parseMWXmlString
}
