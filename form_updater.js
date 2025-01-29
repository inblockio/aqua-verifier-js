#!/usr/bin/env node

import * as fs from 'fs';
import minimist from 'minimist';
/*minimist is using export = syntax, which means it cannot be default-imported unless you enable allowSyntheticDefaultImports*/
// import * as minimist from 'minimist';

const opts = {
  string: ['delete', 'update']
};

const argv = minimist(process.argv.slice(2), opts);

function usage() {
  console.log(`Usage:
form_updater.js <file_to_change.aqua.json> --option

Options:
  --delete <forms key>    Remove the value for the key and mark it as deleted
  --update <forms key> <content>  Update or restore the forms field with new content

Example:
  form_updater.js example.aqua.json --delete forms-name
  form_updater.js example.aqua.json --update forms-age 30
`);
}

function validateInput(filename_par) {

  let filename = "";
  let filename_with_revision_hash = filename_par.split('@');

  if (filename_with_revision_hash.length > 1) {
    filename = filename_with_revision_hash[0];
  } else {
    filename = filename_par;
  }

  if (!filename.endsWith('.aqua.json')) {
    console.error('Error: File must be a .aqua.json file');
    process.exit(1);
  }

  if (!fs.existsSync(filename)) {
    console.error(`Error: File ${filename} does not exist`);
    process.exit(1);
  }
}

function findFormKey(aquaData, key) {
  // Look for exact match or partial match with 'forms-' prefix
  const keys = Object.keys(aquaData);
  return keys.find(k => k === key || k === `forms_${key}` || k.startsWith(`forms_${key}`));
}

function updateForm(filename_par, key, content) {

  let filename = "";
  let file_revision_hash = "";
  let filename_with_revision_hash = filename_par.split('@');
  if (filename_with_revision_hash.length > 1) {
    filename = filename_with_revision_hash[0];
    file_revision_hash = filename_with_revision_hash[1];
  } else {
    filename = filename_par;
  }

  const aquaData = JSON.parse(fs.readFileSync(filename, 'utf8'));
  const revisions = aquaData.revisions;

  // Find the latest revision

  // const targetRevisionHash   = Object.keys(revisions).pop();
  // console.log(`targetRevisionHash: ${targetRevisionHash}`);


  let targetRevisionHash = "";

  if (filename_with_revision_hash.length > 1) {
    // console.log(`Using revision hash: ${JSON.stringify(revisions)}`);
    for (let key in revisions) {
      // console.log(`key: ${key}`);

      if (key == file_revision_hash) {
        // console.log(`Found revision hash: ${file_revision_hash}`);
        // console.log(`Found key: ${key}`);
        targetRevisionHash = key;
        break;
      }
    }
  } else {
    console.log(`Using latest revision`);
    targetRevisionHash = Object.keys(revisions).pop();
  }





  const targetRevision = revisions[targetRevisionHash];

  if (targetRevisionHash == "" || targetRevision == undefined) {
    console.error(`Error: Revision hash not found in file`);
    process.exit(1);
  }

  const formKey = findFormKey(targetRevision, key);

  if (!formKey) {
    console.error(`Error: Form key '${key}' not found`);
    process.exit(1);
  }

  if (content === undefined) {
    // Update in place by renaming the key and setting value to empty string
    const deletedKey = `${formKey}.deleted`;

    let newRevision = {};
    for (let key in targetRevision) {
      if (formKey == key) {
        newRevision[deletedKey] = null;
      } else {
        newRevision[key] = targetRevision[key];
      }
    }
    revisions[targetRevisionHash] = newRevision;
  } else {
    // Update operation
    if (formKey.endsWith('.deleted')) {
      // Restore deleted field
      const originalKey = formKey.replace('.deleted', '');

      let newRevision = {};
      for (let key in targetRevision) {
        if (formKey == key) {
          newRevision[originalKey] = content;
        } else {
          newRevision[key] = targetRevision[key];
        }
      }
      revisions[targetRevisionHash] = newRevision;
    } else {
      // Regular update
      targetRevision[formKey] = content;
    }
  }

  // Write updated data back to file with proper formatting
  const jsonString = JSON.stringify(aquaData, null, 2);
  fs.writeFileSync(filename, jsonString);
  console.log(`Successfully updated ${filename}`);
}

function main() {
  if (argv._.length < 1 || (!argv.delete && !argv.update)) {
    usage();
    process.exit(1);
  }

  const filename = argv._[0];

  validateInput(filename);

  if (argv.delete) {
    console.log('\n Deleting form key \n');
    updateForm(filename, argv.delete);
  } else if (argv.update) {
    console.log(' \n Updating form key \n');
    if (argv._.length < 2) {
      console.error('Error: Missing content for update');
      usage();
      process.exit(1);
    }
    updateForm(filename, argv.update, argv._[1]);
  }
}

main(); 
