import 'dotenv/config';
import bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pool from '../core/config/database.js';

const DEMO_DATABASE = 'dormhive_restore';
const DEMO_PASSWORD = '12345678';
const RECORD_COUNT = 50;
const demoPhotoCategory = {
  bedspace: 'bedspace',
  dormitory: 'bedspace',
  boarding_house: 'solo',
  room_for_rent: 'solo',
  shared_apartment: 'bedspace',
  studio_unit: 'studio',
  condominium: 'studio',
  apartment: 'studio',
  townhouse: 'studio',
  house: 'studio',
  duplex: 'studio',
  loft: 'studio',
  penthouse: 'studio',
  staff_house: 'solo',
  other: 'solo'
};
const demoPropertyCategories = [
  { slug: 'bedspace', name: 'Bedspace', monthlyRent: 3500 },
  { slug: 'dormitory', name: 'Dormitory', monthlyRent: 5000 },
  { slug: 'boarding_house', name: 'Boarding House', monthlyRent: 7000 },
  { slug: 'room_for_rent', name: 'Room for Rent', monthlyRent: 8000 },
  { slug: 'shared_apartment', name: 'Shared Apartment', monthlyRent: 9000 },
  { slug: 'studio_unit', name: 'Studio Unit', monthlyRent: 12000 },
  { slug: 'condominium', name: 'Condominium', monthlyRent: 18000 },
  { slug: 'apartment', name: 'Apartment', monthlyRent: 15000 },
  { slug: 'townhouse', name: 'Townhouse', monthlyRent: 22000 },
  { slug: 'house', name: 'House', monthlyRent: 25000 },
  { slug: 'duplex', name: 'Duplex', monthlyRent: 20000 },
  { slug: 'loft', name: 'Loft', monthlyRent: 16000 },
  { slug: 'penthouse', name: 'Penthouse', monthlyRent: 30000 },
  { slug: 'staff_house', name: 'Staff House', monthlyRent: 8000 },
  { slug: 'other', name: 'Other', monthlyRent: 10000 }
];
const demoPropertyNames = [
  'Amihan House', 'Luna Nest', 'Sampaguita Stay', 'Harbor Haven', 'Acacia Nook',
  'Mabuhay Lodge', 'Solace Home', 'Bayani Place', 'Tahanan Suites', 'Mango Tree House',
  'Sunrise Haven', 'Kamia Corner', 'Balai Verde', 'Moonstone Home', 'Tamarind Nest',
  'Golden Hour Stay', 'Cedar Grove', 'Isla Nook', 'Pahinga Place', 'Kubo Haven',
  'Olive Branch Home', 'Cloud Nine Stay', 'Narra Nook', 'Bloom House', 'Little Harbor',
  'Solana Place', 'Mariposa Home', 'Quiet Corner', 'Sampaguita Suites', 'Morning Light Stay',
  'The Fern House', 'Amihan Corner', 'Casa Verde', 'Breeze Nest', 'Sunlit Place',
  'Duyan House', 'Greenway Haven', 'Haliya Home', 'Garden Gate', 'Little Lantern',
  'Cozy Cove', 'Riverside Nook', 'Starling Stay', 'Moonlit Haven', 'Coral House',
  'Maple Corner', 'Isla Verde', 'Starlight Nook', 'Bloomfield House', 'Daybreak Lodge'
];
const legacyDemoCategoryLabels = {
  bedspace: 'Bedspace',
  dormitory: 'Bedspace',
  boarding_house: 'Solo Room',
  room_for_rent: 'Solo Room',
  shared_apartment: 'Bedspace',
  studio_unit: 'Studio Unit',
  condominium: 'Studio Unit',
  apartment: 'Studio Unit',
  townhouse: 'Studio Unit',
  house: 'Studio Unit',
  duplex: 'Studio Unit',
  loft: 'Studio Unit',
  penthouse: 'Studio Unit',
  staff_house: 'Solo Room',
  other: 'Solo Room'
};

const locations = [
  { city: 'Manila', province: 'Metro Manila', barangay: 'Tondo', latitude: 14.6194, longitude: 120.9663 },
  { city: 'Quezon City', province: 'Metro Manila', barangay: 'Diliman', latitude: 14.6569, longitude: 121.0644 },
  { city: 'Makati', province: 'Metro Manila', barangay: 'Poblacion', latitude: 14.5653, longitude: 121.0318 },
  { city: 'Taguig', province: 'Metro Manila', barangay: 'Pinagsama', latitude: 14.5100, longitude: 121.0550 },
  { city: 'Pasig', province: 'Metro Manila', barangay: 'Kapasigan', latitude: 14.5606, longitude: 121.0795 },
  { city: 'Mandaluyong', province: 'Metro Manila', barangay: 'Highway Hills', latitude: 14.5833, longitude: 121.0499 },
  { city: 'Pasay', province: 'Metro Manila', barangay: 'Malibay', latitude: 14.5487, longitude: 121.0057 },
  { city: 'Parañaque', province: 'Metro Manila', barangay: 'BF Homes', latitude: 14.4478, longitude: 121.0165 },
  { city: 'Las Piñas', province: 'Metro Manila', barangay: 'Almanza Uno', latitude: 14.4375, longitude: 121.0101 },
  { city: 'Muntinlupa', province: 'Metro Manila', barangay: 'Alabang', latitude: 14.4186, longitude: 121.0414 },
  { city: 'Caloocan', province: 'Metro Manila', barangay: 'Bagong Silang', latitude: 14.7667, longitude: 121.0464 },
  { city: 'Marikina', province: 'Metro Manila', barangay: 'Concepcion Uno', latitude: 14.6351, longitude: 121.1029 },
  { city: 'Valenzuela', province: 'Metro Manila', barangay: 'Karuhatan', latitude: 14.7011, longitude: 120.9830 },
  { city: 'Antipolo', province: 'Rizal', barangay: 'San Roque', latitude: 14.5904, longitude: 121.1761 },
  { city: 'San Fernando', province: 'Pampanga', barangay: 'Dolores', latitude: 15.0343, longitude: 120.6893 },
  { city: 'Angeles', province: 'Pampanga', barangay: 'Balibago', latitude: 15.1594, longitude: 120.5901 },
  { city: 'Olongapo', province: 'Zambales', barangay: 'East Bajac-Bajac', latitude: 14.8292, longitude: 120.2828 },
  { city: 'Tarlac City', province: 'Tarlac', barangay: 'San Roque', latitude: 15.4802, longitude: 120.5979 },
  { city: 'Dagupan', province: 'Pangasinan', barangay: 'Pantal', latitude: 16.0374, longitude: 120.3335 },
  { city: 'Baguio', province: 'Benguet', barangay: 'Trancoville', latitude: 16.4263, longitude: 120.6000 },
  { city: 'Laoag', province: 'Ilocos Norte', barangay: 'San Nicolas', latitude: 18.1978, longitude: 120.5957 },
  { city: 'Vigan', province: 'Ilocos Sur', barangay: 'Tamag', latitude: 17.5747, longitude: 120.3869 },
  { city: 'Tuguegarao', province: 'Cagayan', barangay: 'Centro 10', latitude: 17.6132, longitude: 121.7270 },
  { city: 'Santiago', province: 'Isabela', barangay: 'Centro West', latitude: 16.6881, longitude: 121.5487 },
  { city: 'Cauayan', province: 'Isabela', barangay: 'San Fermin', latitude: 16.9348, longitude: 121.7698 },
  { city: 'Naga', province: 'Camarines Sur', barangay: 'Triangulo', latitude: 13.6218, longitude: 123.1948 },
  { city: 'Legazpi', province: 'Albay', barangay: 'Old Albay', latitude: 13.1391, longitude: 123.7438 },
  { city: 'Sorsogon City', province: 'Sorsogon', barangay: 'Balogo', latitude: 12.9736, longitude: 124.0053 },
  { city: 'Puerto Princesa', province: 'Palawan', barangay: 'San Pedro', latitude: 9.7392, longitude: 118.7353 },
  { city: 'Calapan', province: 'Oriental Mindoro', barangay: 'Tawiran', latitude: 13.4116, longitude: 121.1803 },
  { city: 'Batangas City', province: 'Batangas', barangay: 'Poblacion', latitude: 13.7565, longitude: 121.0583 },
  { city: 'Lipa', province: 'Batangas', barangay: 'Sabang', latitude: 13.9411, longitude: 121.1623 },
  { city: 'Lucena', province: 'Quezon', barangay: 'Gulang-gulang', latitude: 13.9414, longitude: 121.6231 },
  { city: 'Cebu City', province: 'Cebu', barangay: 'Lahug', latitude: 10.3297, longitude: 123.9069 },
  { city: 'Mandaue', province: 'Cebu', barangay: 'Banilad', latitude: 10.3236, longitude: 123.9223 },
  { city: 'Lapu-Lapu', province: 'Cebu', barangay: 'Pusok', latitude: 10.3103, longitude: 123.9494 },
  { city: 'Iloilo City', province: 'Iloilo', barangay: 'Jaro', latitude: 10.7202, longitude: 122.5621 },
  { city: 'Bacolod', province: 'Negros Occidental', barangay: 'Mandalagan', latitude: 10.6765, longitude: 122.9509 },
  { city: 'Dumaguete', province: 'Negros Oriental', barangay: 'Daro', latitude: 9.3068, longitude: 123.3054 },
  { city: 'Tagbilaran', province: 'Bohol', barangay: 'Cogon', latitude: 9.6476, longitude: 123.8554 },
  { city: 'Tacloban', province: 'Leyte', barangay: 'Downtown', latitude: 11.2444, longitude: 125.0039 },
  { city: 'Ormoc', province: 'Leyte', barangay: 'District 20', latitude: 11.0064, longitude: 124.6075 },
  { city: 'Roxas City', province: 'Capiz', barangay: 'Baybay', latitude: 11.5853, longitude: 122.7511 },
  { city: 'Kalibo', province: 'Aklan', barangay: 'Andagao', latitude: 11.7080, longitude: 122.3648 },
  { city: 'Davao City', province: 'Davao del Sur', barangay: 'Buhangin', latitude: 7.1167, longitude: 125.6267 },
  { city: 'Cagayan de Oro', province: 'Misamis Oriental', barangay: 'Carmen', latitude: 8.4781, longitude: 124.6334 },
  { city: 'General Santos', province: 'South Cotabato', barangay: 'Lagao', latitude: 6.1128, longitude: 125.1716 },
  { city: 'Zamboanga City', province: 'Zamboanga del Sur', barangay: 'Tetuan', latitude: 6.9214, longitude: 122.0790 },
  { city: 'Butuan', province: 'Agusan del Norte', barangay: 'Libertad', latitude: 8.9560, longitude: 125.5272 },
  { city: 'Iligan', province: 'Lanao del Norte', barangay: 'Pala-o', latitude: 8.2280, longitude: 124.2452 }
];

const makeEmail = (index, domain) => `${String(index).padStart(3, '0')}@${domain}`;
const demoCategoryFor = (index) => demoPropertyCategories[index % demoPropertyCategories.length];
const demoListingTitle = (index, location, category = demoCategoryFor(index)) => {
  if (!demoPropertyNames[index] || !category?.name) {
    throw new Error(`Missing demo name or rent type for listing ${index + 1}.`);
  }
  const place = [location.barangay, location.city].filter(Boolean).join(', ') || location.city;
  return `${demoPropertyNames[index]}, ${category.name} - ${place}`;
};
const legacyDemoListingTitle = (index, location) => {
  const rentType = legacyDemoCategoryLabels[demoCategoryFor(index).slug];
  if (!demoPropertyNames[index] || !rentType) {
    throw new Error(`Missing legacy demo rent type for listing ${index + 1}.`);
  }
  const place = [location.barangay, location.city].filter(Boolean).join(', ') || location.city;
  return `${demoPropertyNames[index]}, ${rentType} - ${place}`;
};
const owners = Array.from({ length: RECORD_COUNT }, (_, index) => {
  const sequence = index + 1;
  return {
    name: `Demo Owner ${String(sequence).padStart(3, '0')}`,
    firstName: 'Demo',
    lastName: `Owner ${String(sequence).padStart(3, '0')}`,
    email: makeEmail(sequence, 'owner.com'),
    role: 'owner'
  };
});
const tenants = Array.from({ length: RECORD_COUNT }, (_, index) => {
  const sequence = index + 1;
  return {
    name: `Demo Tenant ${String(sequence).padStart(3, '0')}`,
    firstName: 'Demo',
    lastName: `Tenant ${String(sequence).padStart(3, '0')}`,
    email: makeEmail(sequence, 'tenants.com'),
    role: 'tenant'
  };
});
const mapSampleOwners = Array.from({ length: RECORD_COUNT }, (_, index) => {
  const sequence = String(index + 1).padStart(3, '0');
  return {
    name: `Map Sample Owner ${sequence}`,
    firstName: 'Map Sample',
    lastName: `Owner ${sequence}`,
    email: `map-sample-owner-${sequence}@dormhive.test`,
    role: 'owner'
  };
});
const mapSampleImageFiles = Array.from({ length: 6 }, (_, index) => `map_sample_${String(index + 1).padStart(2, '0')}.jpg`);

async function seedMapSamples(connection, categoryIds) {
  const emails = mapSampleOwners.map(({ email }) => email);
  const titles = locations.map((location, index) => demoListingTitle(index, location));
  const [existingUsers] = await connection.query(
    `SELECT email FROM users WHERE email IN (${emails.map(() => '?').join(', ')})`,
    emails
  );
  if (existingUsers.length) {
    throw new Error(`Found ${existingUsers.length} map sample owner account(s). Refusing to duplicate map samples.`);
  }
  const [existingListings] = await connection.query(
    `SELECT title FROM properties WHERE title IN (${titles.map(() => '?').join(', ')})`,
    titles
  );
  if (existingListings.length) {
    throw new Error(`Found ${existingListings.length} map sample listing(s). Refusing to duplicate map samples.`);
  }

  const passwordHash = await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  await connection.beginTransaction();
  const userValues = mapSampleOwners.flatMap(({ name, firstName, lastName, email, role }) => [
    name, firstName, lastName, email, passwordHash, role, 'active', 'approved'
  ]);
  const userPlaceholders = mapSampleOwners.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
  await connection.execute(
    `INSERT INTO users (name, first_name, last_name, email, password_hash, role, status, verification_status) VALUES ${userPlaceholders}`,
    userValues
  );

  const [ownerRows] = await connection.query(
    `SELECT id, email FROM users WHERE email IN (${emails.map(() => '?').join(', ')})`,
    emails
  );
  if (ownerRows.length !== RECORD_COUNT) {
    throw new Error(`Expected ${RECORD_COUNT} map sample owners; found ${ownerRows.length}.`);
  }
  const ownerIds = new Map(ownerRows.map(({ id, email }) => [email, id]));
  const propertyValues = mapSampleOwners.flatMap((owner, index) => {
    const location = locations[index];
    const category = demoCategoryFor(index);
    const title = demoListingTitle(index, location, category);
    if (/\bdemo\b/i.test(title)) {
      throw new Error(`Map sample listing title must not contain "demo": ${title}`);
    }
    return [
      ownerIds.get(owner.email),
      title,
      `Map sample location in ${location.barangay}, ${location.city}, ${location.province}.`,
      `${location.barangay}, ${location.city}, ${location.province}`,
      location.city,
      location.barangay,
      categoryIds.get(category.slug),
      category.monthlyRent,
      2,
      ['bedspace', 'dormitory', 'shared_apartment'].includes(category.slug) ? 2 : 1,
      ['bedspace', 'dormitory', 'shared_apartment'].includes(category.slug) ? 2 : 1,
      'co-ed',
      JSON.stringify(['wifi', 'furnished']),
      location.latitude,
      location.longitude,
      null,
      JSON.stringify([]),
      null
    ];
  });
  const propertyPlaceholders = mapSampleOwners
    .map(() => `(${Array.from({ length: 18 }, () => '?').join(', ')}, 'approved')`)
    .join(', ');
  await connection.execute(
    `INSERT INTO properties (owner_id, title, description, address, municipality, barangay, property_category_id, monthly_rent, max_occupants, total_slots, available_slots, gender_preference, amenities, latitude, longitude, image_url, images, ownership_document_id, status) VALUES ${propertyPlaceholders}`,
    propertyValues
  );

  const [listings] = await connection.query(
    `SELECT p.id, p.title, p.owner_id, pc.slug AS category
     FROM properties p
     JOIN property_categories pc ON pc.id = p.property_category_id
     WHERE p.title IN (${titles.map(() => '?').join(', ')})`,
    titles
  );
  if (listings.length !== RECORD_COUNT) {
    throw new Error(`Expected ${RECORD_COUNT} map sample listings; found ${listings.length}.`);
  }
  const listingByOwner = new Map(listings.map((listing) => [listing.owner_id, listing]));
  for (const [index, owner] of mapSampleOwners.entries()) {
    const listing = listingByOwner.get(ownerIds.get(owner.email));
    if (!listing) {
      throw new Error(`Map sample listing was not created for ${owner.email}.`);
    }
    const category = demoCategoryFor(index);
    const isShared = ['bedspace', 'dormitory', 'shared_apartment'].includes(category.slug);
    const arrangement = isShared ? 'shared' : 'exclusive';
    const capacitySlots = isShared ? 2 : 1;
    await connection.execute(
      `INSERT INTO rental_spaces
        (property_id, name, category, occupancy_type, space_type, description, rental_arrangement,
         max_occupants, capacity_slots, total_slots, monthly_rent, rent_basis, gender_preference,
         amenities, availability_status, is_enabled, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, 2, ?, ?, ?, ?, 'co-ed', ?, 'available', 1, 1)`,
      [
        listing.id,
        listing.title,
        category.name,
        arrangement,
        category.name,
        `Map sample space in ${locations[index].barangay}, ${locations[index].city}.`,
        arrangement,
        capacitySlots,
        capacitySlots,
        category.monthlyRent,
        isShared ? 'per_slot' : 'per_space',
        JSON.stringify(['wifi', 'furnished'])
      ]
    );
  }
}

async function updateDemoPhotos(connection, listings) {
  const photoBuffers = new Map();
  for (const category of ['bedspace', 'solo', 'studio']) {
    for (let variant = 1; variant <= 3; variant += 1) {
      const filename = `demo_sample_${category}${variant}.png`;
      photoBuffers.set(filename, await readFile(new URL(`./demo-sample-images/${filename}`, import.meta.url)));
    }
  }

  for (const listing of listings) {
    const category = demoPhotoCategory[String(listing.category).toLowerCase()];
    if (!category) {
      throw new Error(`Unsupported property category "${listing.category}" for demo listing ${listing.id}.`);
    }

    await connection.execute(
      'DELETE FROM media_files WHERE property_id = ? AND LEFT(original_filename, 12) = ?',
      [listing.id, 'demo_sample_']
    );

    const imageReferences = [];
    for (let variant = 1; variant <= 3; variant += 1) {
      const filename = `demo_sample_${category}${variant}.png`;
      const buffer = photoBuffers.get(filename);
      const [result] = await connection.execute(
        `INSERT INTO media_files
          (uploaded_by, property_id, is_private, original_filename, mime_type, file_size, file_data)
         VALUES (?, ?, 0, ?, 'image/png', ?, ?)`,
        [listing.owner_id, listing.id, filename, buffer.length, buffer]
      );
      imageReferences.push(`/api/v1/media/${result.insertId}`);
    }

    await connection.execute(
      'UPDATE properties SET image_url = ?, images = ? WHERE id = ?',
      [imageReferences[0], JSON.stringify(imageReferences), listing.id]
    );
  }
}

async function updateMapSamplePhotos(connection, listings) {
  const photoBuffers = new Map();
  for (const filename of mapSampleImageFiles) {
    photoBuffers.set(filename, await readFile(new URL(`./map-sample-images/${filename}`, import.meta.url)));
  }

  for (const [listingIndex, listing] of listings.entries()) {
    await connection.execute(
      `DELETE FROM media_files
       WHERE property_id = ?
         AND (LEFT(original_filename, 12) = 'demo_sample_' OR LEFT(original_filename, 11) = 'map_sample_')`,
      [listing.id]
    );

    const imageReferences = [];
    const rotatedImageFiles = mapSampleImageFiles.map((_, imageIndex) =>
      mapSampleImageFiles[(listingIndex + imageIndex) % mapSampleImageFiles.length]
    );
    for (const filename of rotatedImageFiles) {
      const buffer = photoBuffers.get(filename);
      const [result] = await connection.execute(
        `INSERT INTO media_files
          (uploaded_by, property_id, is_private, original_filename, mime_type, file_size, file_data)
         VALUES (?, ?, 0, ?, 'image/jpeg', ?, ?)`,
        [listing.owner_id, listing.id, filename, buffer.length, buffer]
      );
      imageReferences.push(`/api/v1/media/${result.insertId}`);
    }

    await connection.execute(
      'UPDATE properties SET image_url = ?, images = ? WHERE id = ?',
      [imageReferences[0], JSON.stringify(imageReferences), listing.id]
    );
  }
}

async function seedDemoData() {
  if (process.env.DATABASE_NAME !== DEMO_DATABASE) {
    throw new Error(`Sample seeding is restricted to the ${DEMO_DATABASE} database.`);
  }
  const isMapSampleSeed = process.argv.includes('--seed-map-samples');
  const restoreMapSampleImages = process.argv.includes('--restore-map-sample-images');
  if (isMapSampleSeed && restoreMapSampleImages) {
    throw new Error('Choose either --seed-map-samples or --restore-map-sample-images.');
  }
  const isMapSampleOperation = isMapSampleSeed || restoreMapSampleImages;
  if (isMapSampleOperation && process.env.MAP_SAMPLE_SEED_APPLY !== 'true') {
    throw new Error('No data was written. Set MAP_SAMPLE_SEED_APPLY=true to seed or update map samples.');
  }
  if (!isMapSampleOperation && process.env.DEMO_SEED_APPLY !== 'true') {
    throw new Error('No data was written. Set DEMO_SEED_APPLY=true to seed or update demo data.');
  }
  if (locations.length !== RECORD_COUNT) {
    throw new Error(`Expected ${RECORD_COUNT} listing locations; found ${locations.length}.`);
  }
  if (demoPropertyNames.length !== RECORD_COUNT) {
    throw new Error(`Expected ${RECORD_COUNT} demo property names; found ${demoPropertyNames.length}.`);
  }
  if (locations.some(({ latitude, longitude }) => !Number.isFinite(latitude) || !Number.isFinite(longitude))) {
    throw new Error('Every demo listing location must have valid coordinates.');
  }

  const connection = await pool.getConnection();
  try {
    const [databaseRows] = await connection.query('SELECT DATABASE() AS name');
    if (databaseRows[0]?.name !== DEMO_DATABASE) {
      throw new Error(`Connected database is not ${DEMO_DATABASE}; no data was written.`);
    }

    const [categoryRows] = await connection.query('SELECT id, slug FROM property_categories');
    const categoryIds = new Map(categoryRows.map(({ id, slug }) => [slug, id]));
    const missingCategories = demoPropertyCategories
      .filter(({ slug }) => !categoryIds.has(slug))
      .map(({ slug }) => slug);
    if (missingCategories.length) {
      throw new Error(`Missing property categories: ${missingCategories.join(', ')}.`);
    }

    if (restoreMapSampleImages) {
      const emails = mapSampleOwners.map(({ email }) => email);
      const [listings] = await connection.query(
        `SELECT p.id, p.owner_id, pc.slug AS category, p.title
         FROM properties p
         JOIN users u ON u.id = p.owner_id
         JOIN property_categories pc ON pc.id = p.property_category_id
         WHERE u.email IN (${emails.map(() => '?').join(', ')}) AND p.status = 'approved'
         ORDER BY u.email`,
        emails
      );
      if (listings.length !== RECORD_COUNT || listings.some(({ title }) => /\bdemo\b/i.test(title))) {
        throw new Error(`Expected ${RECORD_COUNT} approved, non-demo map sample listings; found ${listings.length}.`);
      }
      await connection.beginTransaction();
      await updateMapSamplePhotos(connection, listings);
      await connection.commit();
      console.log(`Restored and rotated the six sample images across ${listings.length} map listings.`);
      return;
    }

    if (isMapSampleSeed) {
      await seedMapSamples(connection, categoryIds);
      await connection.commit();
      console.log(`Created ${RECORD_COUNT} map sample owners and listings across ${locations.length} Philippine locations; no tenants were created.`);
      return;
    }

    if (process.argv.includes('--update-demo-categories')) {
      await connection.beginTransaction();
      let updatedCount = 0;
      for (const [index, owner] of owners.entries()) {
        const [matches] = await connection.execute(
          `SELECT p.id, p.title, p.barangay, p.municipality FROM properties p
           JOIN users u ON u.id = p.owner_id
           WHERE u.email = ? FOR UPDATE`,
          [owner.email]
        );
        if (matches.length !== 1) {
          throw new Error(`Expected one demo listing for ${owner.email}; found ${matches.length}.`);
        }

        const listing = matches[0];
        const location = {
          city: listing.municipality || locations[index].city,
          barangay: listing.barangay || locations[index].barangay
        };
        const category = demoCategoryFor(index);
        const title = demoListingTitle(index, location, category);
        const previousTitle = legacyDemoListingTitle(index, location);
        const oldTitle = `Demo rental ${String(index + 1).padStart(3, '0')} - ${location.city}`;
        if (![title, previousTitle, oldTitle].includes(listing.title)) {
          throw new Error(`Refusing to update unexpected demo listing "${listing.title}" for ${owner.email}.`);
        }

        await connection.execute(
          'UPDATE properties SET title = ?, property_category_id = ?, monthly_rent = ? WHERE id = ?',
          [title, categoryIds.get(category.slug), category.monthlyRent, listing.id]
        );
        updatedCount += 1;
      }
      if (updatedCount !== RECORD_COUNT) {
        throw new Error(`Expected to update ${RECORD_COUNT} demo listings; updated ${updatedCount}.`);
      }
      await connection.commit();
      console.log(`Updated ${updatedCount} demo listings across ${demoPropertyCategories.length} property categories with fixed category prices.`);
      return;
    }

    if (process.argv.includes('--rename-demo-listings')) {
      await connection.beginTransaction();
      let updatedCount = 0;
      for (const [index, owner] of owners.entries()) {
        const [matches] = await connection.execute(
          `SELECT p.id, p.title, p.barangay, p.municipality FROM properties p
           JOIN users u ON u.id = p.owner_id
           WHERE u.email = ? FOR UPDATE`,
          [owner.email]
        );
        if (matches.length !== 1) {
          throw new Error(`Expected one demo listing for ${owner.email}; found ${matches.length}.`);
        }
        const listing = matches[0];
        const location = {
          city: listing.municipality || locations[index].city,
          barangay: listing.barangay || locations[index].barangay
        };
        const title = demoListingTitle(index, location);
        const previousTitle = legacyDemoListingTitle(index, location);
        const oldTitle = `Demo rental ${String(index + 1).padStart(3, '0')} - ${location.city}`;
        if (listing.title === title) continue;
        if (![previousTitle, oldTitle].includes(listing.title)) {
          throw new Error(`Refusing to rename unexpected demo listing "${listing.title}" for ${owner.email}.`);
        }
        await connection.execute('UPDATE properties SET title = ? WHERE id = ?', [title, listing.id]);
        updatedCount += 1;
      }
      await connection.commit();
      console.log(`Renamed ${updatedCount} demo listings using the new naming convention.`);
      return;
    }

    if (process.argv.includes('--update-locations')) {
      await connection.beginTransaction();
      let updatedCount = 0;
      for (const [index, owner] of owners.entries()) {
        const location = locations[index];
        const [matches] = await connection.execute(
          `SELECT p.id FROM properties p
           JOIN users u ON u.id = p.owner_id
           WHERE u.email = ? AND p.title = ? AND p.municipality = ? AND p.barangay = ?`,
          [
            owner.email,
            demoListingTitle(index, location),
            location.city,
            location.barangay
          ]
        );
        if (matches.length !== 1) {
          throw new Error(`Expected one matching listing for ${owner.email}; found ${matches.length}.`);
        }
        await connection.execute(
          'UPDATE properties SET latitude = ?, longitude = ? WHERE id = ?',
          [location.latitude, location.longitude, matches[0].id]
        );
        updatedCount += 1;
      }
      if (updatedCount !== RECORD_COUNT) {
        throw new Error(`Expected to update ${RECORD_COUNT} demo listings; matched ${updatedCount}.`);
      }
      await connection.commit();
      console.log(`Updated map coordinates for ${updatedCount} demo listings. Coordinates mark approximate barangay/city centers.`);
      return;
    }

    if (process.argv.includes('--update-demo-photos')) {
      const listings = [];
      for (const [index, owner] of owners.entries()) {
        const [matches] = await connection.execute(
          `SELECT p.id, pc.slug AS category FROM properties p
           JOIN users u ON u.id = p.owner_id
           JOIN property_categories pc ON pc.id = p.property_category_id
           WHERE u.email = ? AND p.title = ? AND p.status = 'approved'`,
          [owner.email, demoListingTitle(index, locations[index])]
        );
        if (matches.length !== 1) {
          throw new Error(`Expected one approved demo listing for ${owner.email}; found ${matches.length}.`);
        }
        listings.push(matches[0]);
      }

      await connection.beginTransaction();
      await updateDemoPhotos(connection, listings);
      await connection.commit();
      console.log(`Added three matching sample photos to ${listings.length} approved demo listings.`);
      return;
    }

    const emails = [...owners, ...tenants].map(({ email }) => email);
    const [existingUsers] = await connection.query(
      `SELECT email FROM users WHERE email IN (${emails.map(() => '?').join(', ')})`,
      emails
    );
    if (existingUsers.length) {
      throw new Error(`Found ${existingUsers.length} matching demo account(s). Refusing to modify existing data.`);
    }

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
    await connection.beginTransaction();

    const allUsers = [...owners, ...tenants];
    const userValues = allUsers.flatMap(({ name, firstName, lastName, email, role }) => [
      name, firstName, lastName, email, passwordHash, role, 'active', 'approved'
    ]);
    const userPlaceholders = allUsers.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    await connection.execute(
      `INSERT INTO users (name, first_name, last_name, email, password_hash, role, status, verification_status) VALUES ${userPlaceholders}`,
      userValues
    );

    const ownerEmails = owners.map(({ email }) => email);
    const [ownerRows] = await connection.query(
      `SELECT id, email FROM users WHERE email IN (${ownerEmails.map(() => '?').join(', ')})`,
      ownerEmails
    );
    const ownerIds = new Map(ownerRows.map(({ id, email }) => [email, id]));
    const propertyValues = owners.flatMap((owner, index) => {
      const location = locations[index];
      const category = demoCategoryFor(index);
      return [
        ownerIds.get(owner.email),
        demoListingTitle(index, location),
        `Demo listing in ${location.barangay}, ${location.city}, ${location.province}.`,
        `${location.barangay}, ${location.city}, ${location.province}`,
        location.city,
        location.barangay,
        categoryIds.get(category.slug),
        category.monthlyRent,
        2,
        2,
        2,
        'co-ed',
        JSON.stringify(['wifi', 'furnished']),
        location.latitude,
        location.longitude,
        null,
        JSON.stringify([]),
        null
      ];
    });
    const propertyPlaceholders = owners
      .map(() => `(${Array.from({ length: 18 }, () => '?').join(', ')}, 'approved')`)
      .join(', ');
    await connection.execute(
      `INSERT INTO properties (owner_id, title, description, address, municipality, barangay, property_category_id, monthly_rent, max_occupants, total_slots, available_slots, gender_preference, amenities, latitude, longitude, image_url, images, ownership_document_id, status) VALUES ${propertyPlaceholders}`,
      propertyValues
    );

    const demoListings = [];
    for (const [index, owner] of owners.entries()) {
      const [matches] = await connection.execute(
        `SELECT p.id, pc.slug AS category FROM properties p
         JOIN users u ON u.id = p.owner_id
         JOIN property_categories pc ON pc.id = p.property_category_id
         WHERE u.email = ? AND p.title = ? AND p.status = 'approved'`,
        [owner.email, demoListingTitle(index, locations[index])]
      );
      if (matches.length !== 1) {
        throw new Error(`Expected one approved demo listing for ${owner.email}; found ${matches.length}.`);
      }
      demoListings.push(matches[0]);
    }
    await updateDemoPhotos(connection, demoListings);

    await connection.commit();
    console.log(`Created ${tenants.length} tenants, ${owners.length} owners, and ${owners.length} approved demo listings.`);
    console.log('Demo password for all accounts: 12345678');
    console.log('Tenant emails: 001@tenants.com through 050@tenants.com');
    console.log('Owner emails: 001@owner.com through 050@owner.com');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

seedDemoData()
  .catch((error) => {
    console.error(`Demo data seeding failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
