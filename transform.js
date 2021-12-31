const xml2js = require('xml2js')

function makeSureAlwaysArray(x) {
  return Array.isArray(x) ? x : [x]
}

function transformMwXmlRevision2PkcJson(rev) {
  if (!(rev.format === 'text/x-wiki' && rev.model === 'wikitext')) {
    throw "We only support parsing wikitext for now"
  }
  const verification = rev.verification

  // Prepare a content hash map of slots starting with the main slot.
  const contentObj = {
    // If rev.text['_'] is undefined, it means the revision has empty content.
    "main": rev.text['_'] ?? ""
  }
  // And the rest of the slots.
  for (const e of makeSureAlwaysArray(rev.content)) {
    contentObj[e.role] = e.text['_'] ?? ""
  }

  const out = {
    verification_context: JSON.parse(verification.verification_context),
    content: {
      rev_id: rev.id,
      content: contentObj,
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
  if ("file_content_hash" in contentObj) {
    // TODO we set it to empty string because the XML export currently doesn't
    // contain the file data.
    out.content.file = {data: ""}
  }
  return out
}

function transformRevisions(revisions) {
  const out = {}
  for (const rev of revisions) {
    if (!("verification" in rev)) {
      // If the revision does not have verification data, skip to next
      // revision. Vim tip 99: 'gql' makes your comment look well.
      continue
    }
    out[rev.verification.verification_hash] = transformMwXmlRevision2PkcJson(rev)
  }
  return out
}

/*
 * Returns an array of export detail of pages. If the XML string only has one
 * page, then it is an array of 1 page data.
 */
async function parseMWXmlString(fileContent) {
  const parsed = await xml2js.parseStringPromise(fileContent, {explicitArray : false})
  const pages = makeSureAlwaysArray(parsed.mediawiki.page)
  return pages.map(page => {
    // if page.revision is not an array, then it means it contains only 1
    // revision.
    const revisions = makeSureAlwaysArray(page.revision)
    const offline_data = {
      title: page.title,
      data_accounting_chain_height: page.data_accounting_chain_height,
      version: "TODO",
      revisions: transformRevisions(revisions)
    }
    return offline_data
  })
}

module.exports = {
  parseMWXmlString
}
