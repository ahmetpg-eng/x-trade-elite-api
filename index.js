// ... üstte auth, funding, positions vb. var

// -------- Public Instruments (WebTrader için) --------
app.get('/instruments', async (req, res) => {
  try {
    const { group, enabled } = req.query;

    let query = supabase.from('instruments').select(`
      id,
      code,
      symbol,
      display_name,
      group_code,
      provider_code,
      provider_symbol,
      instrument_type,
      tick_size,
      digits,
      is_enabled,
      sort_order
    `);

    if (group) {
      query = query.eq('group_code', group);
    }

    if (enabled === '1' || enabled === 'true') {
      query = query.eq('is_enabled', true);
    }

    const { data, error } = await query.order('sort_order', {
      ascending: true,
    });

    if (error) {
      console.error('Instruments fetch error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ items: data || [] });
  } catch (err) {
    console.error('Instruments fetch error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman listesi alınırken hata oluştu.' });
  }
});

// -------- Admin: Instruments List --------
app.get('/admin/instruments', async (req, res) => {
  try {
    const { group } = req.query;

    let query = supabase.from('instruments').select(`
      id,
      code,
      symbol,
      display_name,
      group_code,
      provider_code,
      provider_symbol,
      instrument_type,
      tick_size,
      digits,
      is_enabled,
      sort_order,
      created_at
    `);

    if (group) {
      query = query.eq('group_code', group);
    }

    const { data, error } = await query.order('sort_order', {
      ascending: true,
    });

    if (error) {
      console.error('Admin instruments fetch error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ items: data || [] });
  } catch (err) {
    console.error('Admin instruments fetch error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman listesi alınırken hata oluştu.' });
  }
});

// -------- Admin: Create Instrument --------
app.post('/admin/instruments', async (req, res) => {
  try {
    const {
      code,
      symbol,
      display_name,
      group_code,
      provider_code,
      provider_symbol,
      instrument_type,
      tick_size,
      digits,
      sort_order,
      is_enabled,
    } = req.body || {};

    if (
      !code ||
      !symbol ||
      !display_name ||
      !group_code ||
      !provider_code ||
      !provider_symbol ||
      !instrument_type
    ) {
      return res.status(400).json({
        message:
          'code, symbol, display_name, group_code, provider_code, provider_symbol ve instrument_type zorunludur.',
      });
    }

    const { data, error } = await supabase
      .from('instruments')
      .insert([
        {
          code,
          symbol,
          display_name,
          group_code,
          provider_code,
          provider_symbol,
          instrument_type,
          tick_size: tick_size ?? 0.01,
          digits: digits ?? 2,
          sort_order: sort_order ?? 0,
          is_enabled: typeof is_enabled === 'boolean' ? is_enabled : true,
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('Admin create instrument error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.status(201).json({ item: data });
  } catch (err) {
    console.error('Admin create instrument error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman oluşturulurken hata oluştu.' });
  }
});

// -------- Admin: Update Instrument --------
app.patch('/admin/instruments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const payload = req.body || {};

    if (!id) {
      return res.status(400).json({ message: 'id zorunludur.' });
    }

    const allowedFields = [
      'display_name',
      'group_code',
      'provider_code',
      'provider_symbol',
      'instrument_type',
      'tick_size',
      'digits',
      'is_enabled',
      'sort_order',
    ];

    const updateData = {};
    for (const key of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(payload, key)) {
        // @ts-ignore
        updateData[key] = payload[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ message: 'Güncellenecek alan yok.' });
    }

    const { data, error } = await supabase
      .from('instruments')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Admin update instrument error:', error);
      return res.status(400).json({ message: error.message });
    }

    return res.json({ item: data });
  } catch (err) {
    console.error('Admin update instrument error:', err);
    return res
      .status(500)
      .json({ message: 'Enstrüman güncellenirken hata oluştu.' });
  }
});
