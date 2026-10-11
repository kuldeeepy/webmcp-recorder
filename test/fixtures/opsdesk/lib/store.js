// In-memory data store for the opsdesk fixture.
export const REASONS = {
  damaged: 'Damaged in transit',
  late_delivery: 'Late delivery',
  wrong_item: 'Wrong item shipped',
  customer_request: 'Customer request',
};

export const CITIES = ['Delhi', 'Mumbai', 'Bengaluru', 'Chennai', 'Hyderabad', 'Pune'];

const ORDER_SEED = [
  ['ORD-1001', 'Aarav Verma', 17770], ['ORD-1002', 'Vivaan Nair', 16440],
  ['ORD-1003', 'Aditya Singh', 19200], ['ORD-1004', 'Arjun Joshi', 15510],
  ['ORD-1005', 'Sai Malhotra', 11460], ['ORD-1006', 'Krishna Pillai', 14560],
  ['ORD-1007', 'Ishaan Bhatt', 12120], ['ORD-1008', 'Rohan Gupta', 1550],
  ['ORD-1009', 'Kabir Iyer', 14210], ['ORD-1010', 'Dev Mehta', 15730],
  ['ORD-1011', 'Priya Rao', 14350], ['ORD-1012', 'Ananya Das', 6770],
  ['ORD-1013', 'Diya Agarwal', 14950], ['ORD-1014', 'Saanvi Sharma', 18980],
  ['ORD-1015', 'Myra Reddy', 19870], ['ORD-1016', 'Aadhya Patel', 17930],
  ['ORD-1017', 'Kavya Kapoor', 4060], ['ORD-1018', 'Riya Chopra', 3130],
  ['ORD-1019', 'Neha Bose', 13270], ['ORD-1020', 'Pooja Kulkarni', 16730],
  ['ORD-1021', 'Rahul Verma', 3680], ['ORD-1022', 'Amit Nair', 9110],
  ['ORD-1023', 'Vikram Singh', 6590], ['ORD-1024', 'Sanjay Joshi', 10150],
  ['ORD-1025', 'Rajesh Malhotra', 13580], ['ORD-1026', 'Suresh Pillai', 1290],
  ['ORD-1027', 'Anil Bhatt', 11150], ['ORD-1028', 'Manoj Gupta', 15290],
  ['ORD-1029', 'Deepak Iyer', 8940], ['ORD-1030', 'Ravi Mehta', 14820],
  ['ORD-1031', 'Pavan Rao', 2870], ['ORD-1032', 'Karan Das', 18180],
  ['ORD-1033', 'Nikhil Agarwal', 9770], ['ORD-1034', 'Varun Sharma', 3940],
  ['ORD-1035', 'Siddharth Reddy', 17610], ['ORD-1036', 'Ayesha Patel', 4140],
  ['ORD-1037', 'Fatima Kapoor', 7140], ['ORD-1038', 'Zara Chopra', 15380],
  ['ORD-1039', 'Meera Bose', 6040], ['ORD-1040', 'Lakshmi Kulkarni', 1090],
];

export const orders = ORDER_SEED.map(([orderNumber, customer, total]) => ({ orderNumber, customer, total }));

const CUSTOMER_SEED = [
  ['Aarav Verma', 'aarav.verma@example.com', '9810012345', 'Delhi'],
  ['Vivaan Nair', 'vivaan.nair@example.com', '9820012345', 'Mumbai'],
  ['Aditya Singh', 'aditya.singh@example.com', '9830012345', 'Bengaluru'],
  ['Arjun Joshi', 'arjun.joshi@example.com', '9840012345', 'Chennai'],
  ['Sai Malhotra', 'sai.malhotra@example.com', '9850012345', 'Hyderabad'],
];
export let customers = CUSTOMER_SEED.map(([name, email, phone, city]) => ({ name, email, phone, city }));

// refunds: orderNumber -> refund record
export let refunds = new Map();
// Test-only: simulates a site update that renames the refund button.
export const ui = { redesigned: false };
let refundSeq = 1;
export function nextRefundId() { return 'RFD-' + String(refundSeq++).padStart(4, '0'); }

export function resetState() {
  refunds = new Map();
  refundSeq = 1;
  customers = CUSTOMER_SEED.map(([name, email, phone, city]) => ({ name, email, phone, city }));
}

export function findOrder(orderNumber) {
  return orders.find((o) => o.orderNumber === orderNumber);
}
