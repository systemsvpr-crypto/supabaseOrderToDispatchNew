/**
 * GOOGLE APPS SCRIPT - Unified Web App for Order To Dispatch
 * 
 * VERSION: 2.0 (Resilience Update)
 * 
 * CHANGES:
 * - Removed CacheService to prevent size-related CORS failures.
 * - Added strict checks for Spreadsheet ID.
 * - Simplified JSON_RESPONSE for better compatibility.
 * - Wrapped everything in definitive try-catch blocks.
 */

function doGet(e) {
  try {
    const sheetName = e.parameter.sheet;
    const colIndex = parseInt(e.parameter.col) || 0;
    const mode = e.parameter.mode;
    const sheetId = e.parameter.sheetId;

    if (!sheetName) return JSON_RESPONSE({ success: false, error: "Missing 'sheet' parameter" });

    let ss;
    if (sheetId && typeof sheetId === 'string' && sheetId.trim() !== "") {
      ss = SpreadsheetApp.openById(sheetId.trim());
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }

    if (!ss) throw new Error("Spreadsheet not found or access denied.");

    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return JSON_RESPONSE({ success: false, error: "Sheet '" + sheetName + "' not found" });

    const data = sheet.getDataRange().getValues();
    if (data.length === 0) return JSON_RESPONSE({ success: true, data: [] });

    // Header normalization
    const headers = data[0].map(h => String(h).toLowerCase().trim());
    const getCol = (name) => {
      let idx = headers.indexOf(name.toLowerCase());
      if (idx === -1) {
        idx = headers.findIndex(h => h.replace(/\s/g, '') === name.toLowerCase().replace(/\s/g, ''));
      }
      return idx;
    };

    let responseObj;

    if (mode === "table") {
      if (sheetName === "Login") {
        const rows = data.slice(1).map((row, idx) => ({
          originalIndex: idx + 2,
          name:          row[1] || '-',
          id:            row[2] || '-',
          password:      row[3] || '-',
          role:          row[4] || 'user',
          pageAccess:    (row[5] || '').split(',').map(s => s.trim()).filter(Boolean)
        }));
        responseObj = { success: true, data: rows };
      }
      else if (sheetName === "ORDER") {
        const idx = {
          orderNo:   getCol("Order No"),
          orderDate: getCol("Order Date"),
          client:    getCol("Client"),
          godown:    getCol("Godown"),
          item:      getCol("Item"),
          rate:      getCol("Rate"),
          qty:       getCol("Qty"),
          intransitQty: getCol("Intransit Qty")
        };
        const rows = data.slice(1).map((row, index) => ({
          originalIndex: index + 2,
          orderNumber:   idx.orderNo !== -1 ? row[idx.orderNo] : row[1] || '-',
          orderDate:     idx.orderDate !== -1 ? row[idx.orderDate] : row[2] || '-',
          clientName:    idx.client !== -1 ? row[idx.client] : row[3] || '-',
          godownName:    idx.godown !== -1 ? row[idx.godown] : row[4] || '-',
          itemName:      idx.item !== -1 ? row[idx.item] : row[5] || '-',
          rate:          idx.rate !== -1 ? row[idx.rate] : row[6] || '0',
          qty:           idx.qty !== -1 ? row[idx.qty] : row[7] || '0',
          createdBy:     row[24] || '-',
          currentStock:  row[8] != null ? String(row[8]) : '-',
          intransitQty:  idx.intransitQty !== -1 ? row[idx.intransitQty] : row[9] || '-',
          planningQty:   row[10] != null ? String(row[10]) : '0',
          planningPendingQty: row[11] != null ? String(row[11]) : '0',
          qtyDelivered:  row[12] != null ? String(row[12]) : '0',
          cancelQty:     row[13] != null ? String(row[13]) : '0',
          columnQ:       row[16] != null ? String(row[16]) : '',
          columnR:       row[17] != null ? String(row[17]) : ''
        }));
        responseObj = { success: true, data: rows };
      }
      else if (sheetName === "Planning") {
        const allRows = data.slice(1).map((row, idx) => ({ row, sheetRow: idx + 2 }));
        const filteredRows = allRows.filter(item => {
          const firstCell = String(item.row[0]).trim();
          if (firstCell === '' || firstCell === 'Timestamp') return false;
          const status = item.row[10] ? String(item.row[10]).trim() : '';
          return status !== 'Completed';
        });
        responseObj = {
          success: true,
          data: filteredRows.map(item => ({
            originalIndex: item.sheetRow,
            timestamp:     item.row[0],
            dispatchNo:    item.row[1],
            orderNumber:   item.row[2],
            clientName:    item.row[3],
            godownName:    item.row[4],
            itemName:      item.row[5],
            qty:           item.row[6],
            dispatchQty:   item.row[7],
            dispatchDate:  item.row[8],
            gstIncluded:   item.row[9],
            columnK:       item.row[10] || '',
            columnL:       item.row[11] || '',
            columnO:       item.row[14] || '',
            columnP:       item.row[15] || '',
            columnT:       item.row[19] || '',
            columnU:       item.row[20] || '',
            crmName:       item.row[29] || ""
          }))
        };
      }
      else if (sheetName === "Dispatch Completed") {
        const idx = {
          dispatchNo:   getCol("Dispatch No"),
          dispatchDate: getCol("Dispatch Date"),
          completeDate: getCol("Complete Date"),
          customer:     getCol("Customer"),
          product:      getCol("Product"),
          godown:       getCol("Godown"),
          orderQty:     getCol("Order Qty"),
          dispatchQty:  getCol("Dispatch Qty"),
          status:       getCol("Status"),
          crmName:      getCol("CRM Name")
        };
        const rows = data.slice(1).map((row, index) => ({
          originalIndex: index + 2,
          timestamp:    row[0],
          dispatchNo:   idx.dispatchNo   !== -1 ? row[idx.dispatchNo]   : row[1],
          dispatchDate: idx.dispatchDate !== -1 ? row[idx.dispatchDate] : row[2],
          completeDate: idx.completeDate !== -1 ? row[idx.completeDate] : row[3],
          customer:     idx.customer     !== -1 ? row[idx.customer]     : row[4],
          product:      idx.product      !== -1 ? row[idx.product]      : row[5],
          godown:       idx.godown       !== -1 ? row[idx.godown]       : row[6],
          orderQty:     idx.orderQty     !== -1 ? row[idx.orderQty]     : row[7],
          dispatchQty:  idx.dispatchQty  !== -1 ? row[idx.dispatchQty]  : row[8],
          status:       idx.status       !== -1 ? row[idx.status]       : row[9],
          crmName:      idx.crmName      !== -1 ? row[idx.crmName]      : row[10]
        }));
        responseObj = { success: true, data: rows };
      }
      else {
        // Generic table mode
        const rows = data.slice(1).map(row => {
          let obj = {};
          data[0].forEach((header, i) => obj[header || `col${i}`] = row[i]);
          return obj;
        });
        responseObj = { success: true, data: rows };
      }
    } else {
      // Dropdown / Column mode
      const values = data.slice(1).map(row => row[colIndex]).filter(val => val !== "");
      responseObj = { success: true, data: [...new Set(values)].sort() };
    }

    return JSON_RESPONSE(responseObj);

  } catch (error) {
    return JSON_RESPONSE({ success: false, error: error.toString(), stack: error.stack });
  }
}

function doPost(e) {
  try {
    const contents = e.postData.contents;
    const params = JSON.parse(contents);
    
    let ss;
    if (params.sheetId && typeof params.sheetId === 'string' && params.sheetId.trim() !== "") {
      ss = SpreadsheetApp.openById(params.sheetId.trim());
    } else {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    }
    
    const sheetName = params.sheet;
    const rows = params.rows;
    const mode = params.mode;

    if (!ss) throw new Error("Spreadsheet not found");
    const sheet = ss.getSheetByName(sheetName);
    if (!sheet) return JSON_RESPONSE({ success: false, error: "Sheet '" + sheetName + "' not found" });

    if (sheetName === "Login") {
      if (mode === 'append') {
        const existingData = sheet.getDataRange().getValues();
        let nextSerial = 1;
        if (existingData.length > 1) {
          const serials = existingData.slice(1).map(row => parseInt(row[0])).filter(num => !isNaN(num));
          nextSerial = (serials.length > 0 ? Math.max(...serials) : 0) + 1;
        }
        rows.forEach(row => {
          sheet.appendRow([nextSerial++, row['User Name'], row['User ID'], row['Password'], row['Role'], row['Page Access']]);
        });
      } else if (mode === 'update') {
        const targetRow = params.originalIndex;
        if (!targetRow) throw new Error("Missing originalIndex for update");
        const rowData = rows[0];
        sheet.getRange(targetRow, 2, 1, 5).setValues([[rowData['User Name'], rowData['User ID'], rowData['Password'], rowData['Role'], rowData['Page Access']]]);
      } else if (mode === 'delete') {
        const targetRow = params.originalIndex;
        if (!targetRow) throw new Error("Missing originalIndex for delete");
        sheet.deleteRow(targetRow);
      }
    }
    else if (sheetName === "ORDER") {
      const data = sheet.getDataRange().getValues();
      let nextNum = 1;
      if (data.length > 1) {
        const nums = data.slice(1).map(row => {
          const val = row[1] ? row[1].toString() : "";
          const match = val.match(/VPR\/OR-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        });
        nextNum = Math.max(...nums, 0) + 1;
      }
      const orderNumber = "VPR/OR-" + String(nextNum).padStart(3, '0');

      rows.forEach(row => {
        const newRow = new Array(25).fill('');
        newRow[0] = new Date();
        newRow[1] = orderNumber;
        newRow[2] = row.orderDate;
        newRow[3] = row.clientName;
        newRow[4] = row.godownName;
        newRow[5] = row.itemName;
        newRow[6] = row.rate;
        newRow[7] = row.qty;
        newRow[24] = row.createdBy || '';
        sheet.appendRow(newRow);
      });
    }
    else if (sheetName === "Planning") {
      const data = sheet.getDataRange().getValues();
      let nextDispNum = 1;
      if (data.length > 1) {
        const nums = data.slice(1).map(row => {
          const val = row[1] ? row[1].toString() : "";
          const match = val.match(/DN-(\d+)/);
          return match ? parseInt(match[1]) : 0;
        });
        nextDispNum = Math.max(...nums, 0) + 1;
      }

      rows.forEach(row => {
        const dispatchNo = "DN-" + String(nextDispNum++).padStart(3, '0');
        sheet.appendRow([new Date(), dispatchNo, row.orderNo, row.clientName, row.godownName, row.itemName, row.qty, row.dispatchQty, row.dispatchDate, row.gstIncluded, row.crmName || ""]);
      });
    }
    // ... Add other sheets as needed or use generic append if not specific
    else {
      rows.forEach(row => {
        const values = Object.values(row);
        sheet.appendRow([new Date(), ...values]);
      });
    }

    return JSON_RESPONSE({ success: true });
  } catch (error) {
    return JSON_RESPONSE({ success: false, error: error.toString() });
  }
}

function JSON_RESPONSE(obj) {
  const json = JSON.stringify(obj);
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader('Access-Control-Allow-Origin', '*');
}

function doOptions() {
  return ContentService.createTextOutput('')
    .setHeader('Access-Control-Allow-Origin', '*')
    .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    .setHeader('Access-Control-Allow-Headers', 'Content-Type')
    .setHeader('Access-Control-Max-Age', '3600');
}
