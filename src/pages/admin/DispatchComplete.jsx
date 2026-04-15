const handleSave = async () => {
  const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
  if (selectedIds.length === 0) return;

  setIsSaving(true);
  try {
    const now = new Date().toISOString();
    const rowsToLog = [];
    const updates = [];

    for (const id of selectedIds) {
      const item = orders.find(o => String(o.id) === String(id));
      if (item) {
        // Get edited values or keep original
        const finalQty = editData[id]?.dispatchQty !== undefined
          ? parseInt(editData[id].dispatchQty, 10)
          : parseInt(item.dispatchQty, 10);

        const finalGodown = editData[id]?.godown || item.godownName;
        const finalProduct = editData[id]?.product || item.itemName;

        // 1. Prepare log entry for dispatch_completed_log table with order_number
        rowsToLog.push({
          dispatch_id: item.id,
          dispatch_number: item.dispatchNo,
          dispatch_date: item.dispatchDate,
          complete_date: now.split('T')[0],
          client_name: item.clientName,
          product_name: finalProduct,
          godown_name: finalGodown,
          order_qty: parseInt(item.qty, 10),
          dispatch_qty: finalQty,
          crm_name: user?.name || item.crmName || 'System',
          status: 'Completed',
          order_number: item.orderNumber,  // Add order_number
          order_no: item.orderNumber,      // Add order_no (same as order_number if that's what you need)
          order_id: item.order_id
        });

        // 2. Update dispatch_plans table ONLY (NOT app_orders)
        updates.push(
          supabase.from('dispatch_plans').update({
            planned_qty: finalQty,
            godown_name: finalGodown,
            dispatch_completed: true,
            completed_at: now,
            status: 'Completed',
            product_name: finalProduct,  // Only changes in dispatch_plans
            submitted_by: user?.name || item.crmName || 'System'
          }).eq('id', item.id)
        );
      }
    }

    // 3. FIRST: Insert into dispatch_completed_log
    if (rowsToLog.length > 0) {
      const logResult = await supabase.from('dispatch_completed_log').insert(rowsToLog);
      if (logResult.error) throw logResult.error;
    }

    // 4. SECOND: Update dispatch_plans (only after log is successful)
    if (updates.length > 0) {
      const updateResults = await Promise.all(updates);
      const errorRes = updateResults.find(res => res.error);
      if (errorRes) throw errorRes.error;
    }

    showToast(`${rowsToLog.length} dispatch(s) marked as completed!`, 'success');
    setSelectedRows({});
    setEditData({});
    await fetchPendingOrders(true);
    await fetchHistory(true);
  } catch (error) {
    console.error('Save failed:', error);
    showToast('Error', `Failed to save dispatch completion: ${error.message}`);
  } finally {
    setIsSaving(false);
  }
};

// ========== SINGLE CANCEL ==========
const handleCancelDispatch = async (item) => {
  const cancelQtyStr = window.prompt(`Enter quantity to CANCEL for ${item.dispatchNo} (Max: ${item.dispatchQty}):`, item.dispatchQty);
  if (cancelQtyStr === null) return;

  const qtyToCancel = parseFloat(cancelQtyStr);
  const currentQty = parseFloat(item.dispatchQty);

  if (isNaN(qtyToCancel) || qtyToCancel <= 0) {
    showToast('Error', 'Please enter a valid quantity');
    return;
  }

  if (qtyToCancel > currentQty + 0.001) {
    showToast('Error', 'Cannot cancel more than the planned quantity');
    return;
  }

  setIsSaving(true);
  try {
    // STEP 1: Get current order quantity
    const { data: currentOrder } = await supabase
      .from('app_orders')
      .select('qty')
      .eq('id', item.order_id)
      .single();
    
    const currentOrderQty = parseFloat(currentOrder?.qty) || 0;
    const newOrderQty = currentOrderQty + qtyToCancel; // ADD BACK the cancelled quantity

    // STEP 2: Get next dispatch number for cancellation record
    const { data: allPlans } = await supabase.from('dispatch_plans').select('dispatch_number');
    const maxNo = (allPlans || []).reduce((max, p) => {
      const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 1000);

    // STEP 3: FIRST - Create cancellation record in dispatch_plans
    if (Math.abs(qtyToCancel - currentQty) < 0.001) {
      // Cancel the entire dispatch plan
      const { error } = await supabase.from('dispatch_plans').update({
        status: 'Canceled',
        dispatch_completed: true,
        informed_after_dispatch: true,
        submitted_by: user?.name || 'System',
        cancelled_at: new Date().toISOString(),
        cancelled_qty: qtyToCancel
      }).eq('id', item.id);
      if (error) throw new Error(`Cancel update failed: ${error.message}`);
    } else {
      // Reduce the planned quantity on the existing plan
      const remainingPlannedQty = currentQty - qtyToCancel;
      const { error: upErr } = await supabase.from('dispatch_plans').update({
        planned_qty: remainingPlannedQty
      }).eq('id', item.id);
      if (upErr) throw new Error(`Existing plan update failed: ${upErr.message}`);

      // Create separate cancellation record for audit trail
      const { error: inErr } = await supabase.from('dispatch_plans').insert({
        order_id: item.order_id,
        dispatch_number: `DN-${maxNo + 1}-CXL`,
        planned_qty: qtyToCancel,
        planned_date: item.dispatchDate,
        godown_name: item.godownName,
        status: 'Canceled',
        gst_included: item.gstIncluded || 'No',
        dispatch_completed: true,
        informed_before_dispatch: true,
        informed_after_dispatch: true,
        submitted_by: user?.name || 'System',
        product_name: item.itemName,
        order_qty: parseFloat(item.qty) || 0,
        client_name: item.clientName,
        order_number: item.orderNumber,
        cancelled_at: new Date().toISOString(),
        cancelled_qty: qtyToCancel
      });
      if (inErr) throw new Error(`Audit record creation failed: ${inErr.message}`);
    }

    // STEP 4: ONLY AFTER cancellation record is created, update order table
    const { error: ordErr } = await supabase
      .from('app_orders')
      .update({ qty: newOrderQty })
      .eq('id', item.order_id);
    if (ordErr) throw ordErr;

    showToast(`Dispatch cancelled and ${qtyToCancel} quantity added back to order`, 'success');
    await fetchPendingOrders(true);
    await fetchHistory(true);
  } catch (err) {
    console.error(err);
    showToast('Error', err.message);
  } finally {
    setIsSaving(false);
  }
};

// ========== BULK CANCEL ==========
const handleBulkCancelDispatch = async () => {
  const selectedIds = Object.keys(selectedRows).filter(id => selectedRows[id]);
  if (selectedIds.length === 0) return;

  if (!window.confirm(`Are you sure you want to CANCEL the selected quantity for these ${selectedIds.length} dispatches?\n\nThis will add the cancelled quantity back to the original orders.`)) return;

  setIsSaving(true);
  try {
    // STEP 1: Get current max dispatch number
    const { data: plansData } = await supabase.from('dispatch_plans').select('dispatch_number');
    let currentMaxNo = (plansData || []).reduce((max, p) => {
      const n = parseInt(String(p.dispatch_number).replace(/^(DSP|DN-)/, ''), 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 1000);

    const cancellationRecords = [];
    const planUpdates = [];
    const orderUpdates = [];

    for (const dispatchId of selectedIds) {
      const rowData = orders.find(o => String(o.id) === String(dispatchId));
      if (!rowData) continue;

      const qtyToCancel = editData[dispatchId]?.dispatchQty !== undefined
        ? parseFloat(editData[dispatchId].dispatchQty)
        : parseFloat(rowData.dispatchQty);

      const currentQty = parseFloat(rowData.dispatchQty);

      // Get current order quantity to add back the cancelled amount
      const { data: currentOrder } = await supabase
        .from('app_orders')
        .select('qty')
        .eq('id', rowData.order_id)
        .single();
      
      const currentOrderQty = parseFloat(currentOrder?.qty) || 0;
      const newOrderQty = currentOrderQty + qtyToCancel;

      if (Math.abs(qtyToCancel - currentQty) < 0.001) {
        // Cancel the entire dispatch plan
        planUpdates.push(
          supabase.from('dispatch_plans').update({
            status: 'Canceled',
            submitted_by: user?.name || 'System',
            dispatch_completed: true,
            informed_after_dispatch: true,
            cancelled_at: new Date().toISOString(),
            cancelled_qty: qtyToCancel
          }).eq('id', rowData.id)
        );
      } else {
        // Reduce the planned quantity on the existing plan
        const remainingPlannedQty = currentQty - qtyToCancel;
        planUpdates.push(
          supabase.from('dispatch_plans').update({
            planned_qty: remainingPlannedQty
          }).eq('id', rowData.id)
        );

        // Create cancellation record for audit trail
        currentMaxNo++;
        cancellationRecords.push({
          order_id: rowData.order_id,
          dispatch_number: `DN-${currentMaxNo}-CXL`,
          planned_qty: qtyToCancel,
          planned_date: rowData.dispatchDate,
          godown_name: rowData.godownName,
          status: 'Canceled',
          gst_included: rowData.gstIncluded || 'No',
          submitted_by: user?.name || 'System',
          dispatch_completed: true,
          informed_before_dispatch: true,
          informed_after_dispatch: true,
          product_name: rowData.itemName,
          order_qty: parseFloat(rowData.qty) || 0,
          client_name: rowData.clientName,
          order_number: rowData.orderNumber,
          cancelled_at: new Date().toISOString(),
          cancelled_qty: qtyToCancel
        });
      }

      // Prepare order update (add quantity back)
      orderUpdates.push(
        supabase.from('app_orders').update({ qty: newOrderQty }).eq('id', rowData.order_id)
      );
    }

    // STEP 2: FIRST - Create all cancellation records
    if (cancellationRecords.length > 0) {
      const insResult = await supabase.from('dispatch_plans').insert(cancellationRecords);
      if (insResult.error) throw insResult.error;
    }

    // STEP 3: SECOND - Update existing plans
    if (planUpdates.length > 0) {
      const updateResults = await Promise.all(planUpdates);
      const errorRes = updateResults.find(res => res.error);
      if (errorRes) throw errorRes.error;
    }

    // STEP 4: THIRD - Update order table (add quantity back)
    if (orderUpdates.length > 0) {
      const orderResults = await Promise.all(orderUpdates);
      const errorRes = orderResults.find(res => res.error);
      if (errorRes) throw errorRes.error;
    }

    showToast(`${selectedIds.length} dispatch(s) cancelled and quantity added back to orders`, 'success');
    await fetchPendingOrders(true);
    await fetchHistory(true);
    setSelectedRows({});
    setEditData({});
  } catch (err) {
    console.error(err);
    showToast('Error during bulk cancel', err.message);
  } finally {
    setIsSaving(false);
  }
};