const machines = (process.env.MACHINE_LIST?.split(",") ?? [])
  .map((m) => m.trim())
  .filter((m) => m.length > 0);

interface QueueResponse {
  queue_running: any[];
  queue_pending: any[];
}

// check if which machine is available
export async function getAvailableMachines(): Promise<string[]> {
  const availableMachines = [];

  for (const machine of machines) {
    console.log(`Checking machine ${machine}...`);
    try {
      const response = await fetch(`${machine}/queue`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = (await response.json()) as QueueResponse;
        // Machine is available if it has no running queue and no pending queue
        const isAvailable =
          data.queue_running.length === 0 && data.queue_pending.length === 0;

        if (isAvailable) {
          availableMachines.push(machine);
        }
      }
    } catch (error) {
      console.error(`Failed to check machine ${machine}:`, error);
    }
  }

  return availableMachines;
}
