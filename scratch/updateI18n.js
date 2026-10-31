import fs from 'fs';

function updateFile(path, oldText, newText) {
  let content = fs.readFileSync(path, 'utf8');
  // Normalize line endings for replacement
  const isCrlf = content.includes('\r\n');
  const normalizedContent = content.replace(/\r\n/g, '\n');
  const normalizedOld = oldText.replace(/\r\n/g, '\n');
  const normalizedNew = newText.replace(/\r\n/g, isCrlf ? '\r\n' : '\n');

  if (!normalizedContent.includes(normalizedOld)) {
    console.error('Target text not found in ' + path);
    process.exit(1);
  }

  const updatedNormalized = normalizedContent.replace(normalizedOld, normalizedNew);
  const finalContent = isCrlf ? updatedNormalized.replace(/\n/g, '\r\n').replace(/\r\r\n/g, '\r\n') : updatedNormalized;
  fs.writeFileSync(path, finalContent, 'utf8');
  console.log('Successfully updated ' + path);
}

const hrOld = `        status: {
            pending: "Na čekanju",
            approved: "Odobreno",
            rejected: "Odbijeno",
            cancelled: "Otkazano",
        },`;

const hrNew = `        status: {
            pending: "Na čekanju",
            waitlisted: "Lista čekanja",
            approved: "Odobreno",
            in_progress: "U tijeku",
            completed: "Završeno",
            not_performed: "Nije izvedeno",
            rejected: "Odbijeno",
            cancelled: "Otkazano",
        },`;

const enOld = `        status: {
            pending: "Pending",
            approved: "Approved",
            rejected: "Rejected",
            cancelled: "Cancelled",
        },`;

const enNew = `        status: {
            pending: "Pending",
            waitlisted: "Waitlisted",
            approved: "Approved",
            in_progress: "In Progress",
            completed: "Completed",
            not_performed: "Not Performed",
            rejected: "Rejected",
            cancelled: "Cancelled",
        },`;

updateFile('client/src/i18n/hr.ts', hrOld, hrNew);
updateFile('client/src/i18n/en.ts', enOld, enNew);
