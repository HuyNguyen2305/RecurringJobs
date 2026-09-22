import { Baserepository } from '#common/base-repository.js';
import { Location } from '#models/location.model.js';

export class LocationRepository extends Baserepository {
  constructor() {
    super(Location);
  }
}
